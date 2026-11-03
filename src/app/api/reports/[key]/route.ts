import type { NextRequest } from "next/server";
import { authorizeRoute } from "@/lib/route-auth";
import { writeAudit } from "@/lib/audit";
import { fileResponse, toCsv, toXlsx, type ExportColumn } from "@/lib/spreadsheet";
import { getReport } from "@/features/reports/registry";
import { EXCEL_FORMAT, describeFilters, formatCell, parseReportFilters } from "@/features/reports/shared";
import { reportPdf } from "@/features/reports/report-pdf";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/reports/[key]">) {
  const { user, denied } = await authorizeRoute("report:read", "report:export");
  if (denied) return denied;

  const { key } = await ctx.params;
  const def = getReport(key);
  if (!def) return Response.json({ error: "Unknown report" }, { status: 404 });

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const filters = parseReportFilters(def, sp);
  const [{ rows, summary }, subtitle] = await Promise.all([def.load(filters), describeFilters(def, filters)]);
  const format = sp.format === "csv" ? "csv" : sp.format === "pdf" ? "pdf" : "xlsx";
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${def.key}-${stamp}`;

  await writeAudit({ actorId: user!.id, action: "report.export", entityType: "Report", entityId: def.key, summary: `Exported ${def.title} (${format.toUpperCase()}, ${rows.length} rows)` });

  if (format === "pdf") {
    const bytes = await reportPdf({
      title: def.title,
      subtitle,
      company: process.env.COMPANY_NAME ?? "Company",
      // Landscape PDF keeps to the on-screen columns; Excel/CSV get them all.
      columns: def.columns.filter((c) => !c.exportOnly),
      rows,
      summary,
      generatedBy: user!.name,
    });
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" },
    });
  }

  if (format === "csv") {
    const cols: ExportColumn<unknown>[] = def.columns.map((c) => ({
      header: c.header,
      // Plain numbers stay numeric for spreadsheets; dates as ISO.
      value: (r) => {
        const v = c.value(r);
        return v instanceof Date ? v.toISOString().slice(0, 10) : c.kind === "money" || c.kind === "number" ? (v as number | null) : formatCell(c.kind, v);
      },
    }));
    return fileResponse(toCsv(cols, rows), `${name}.csv`, "csv");
  }

  const cols: ExportColumn<unknown>[] = def.columns.map((c) => ({
    header: c.header,
    width: Math.round((c.width ?? 10) * 1.3) + 2,
    numFmt: c.kind ? EXCEL_FORMAT[c.kind] : undefined,
    value: (r) => {
      const v = c.value(r);
      return v === undefined ? null : (v as string | number | Date | null);
    },
  }));
  const xlsx = await toXlsx(def.title, cols, rows, { title: def.title, subtitle: `${subtitle} · ${summary.map((s) => `${s.label}: ${s.value}`).join(" · ")}` });
  return fileResponse(xlsx, `${name}.xlsx`, "xlsx");
}
