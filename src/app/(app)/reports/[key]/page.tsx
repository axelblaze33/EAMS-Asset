import { notFound } from "next/navigation";
import { FileBarChart } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { getOrgOptions } from "@/features/master-data/queries";
import { getReport } from "@/features/reports/registry";
import { describeFilters, formatCell, parseReportFilters } from "@/features/reports/shared";
import { ReportFilterBar } from "@/features/reports/report-filter-bar";

export const metadata = { title: "Report" };

const PREVIEW_ROWS = 300;

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[key]">) {
  const user = await requirePagePermission("report:read");
  const { key } = await params;
  const def = getReport(key);
  if (!def) notFound();

  const filters = parseReportFilters(def, await searchParams);
  const [{ rows, summary }, subtitle, org, employees, assets] = await Promise.all([
    def.load(filters),
    describeFilters(def, filters),
    getOrgOptions(),
    def.filters.includes("employee")
      ? db.employee.findMany({ where: { deletedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } })
      : [],
    def.filters.includes("asset")
      ? db.asset.findMany({ orderBy: { assetCode: "asc" }, select: { id: true, assetCode: true, name: true, serialNumber: true, deletedAt: true } })
      : [],
  ]);
  const columns = def.columns.filter((c) => !c.exportOnly);
  const numeric = (k?: string) => k === "money" || k === "number";

  return (
    <>
      <PageHeader title={def.title} description={def.description} />

      <ReportFilterBar
        reportKey={def.key}
        filters={def.filters}
        dateLabel={def.dateLabel}
        dateHint={def.key === "warranty" ? "Showing the next 90 days." : def.key === "depreciation" ? "Valued as of today." : undefined}
        canExport={hasPermission(user, "report:export")}
        options={{
          departments: org.departments,
          categories: org.categories,
          statuses: def.statusOptions,
          employees: employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})`, hint: e.department?.name })),
          assets: assets.map((a) => ({ value: a.id, label: `${a.assetCode} · ${a.name}`, hint: [a.serialNumber && `S/N ${a.serialNumber}`, a.deletedAt && "deleted"].filter(Boolean).join(" · ") })),
        }}
      />

      {/* Shown on screen and in print, so a printout carries its own context. */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="rounded-xl border bg-card px-4 py-3 shadow-xs">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums" title={s.value}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No records match these filters" description="Try a wider date range or clear some filters." />
      ) : (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c, i) => (
                    <TableHead key={c.header} className={cn(i === 0 && "pl-4", numeric(c.kind) && "text-right", i === columns.length - 1 && "pr-4")}>
                      {c.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, PREVIEW_ROWS).map((row, r) => (
                  <TableRow key={r}>
                    {columns.map((c, i) => {
                      const text = formatCell(c.kind, c.value(row));
                      return (
                        <TableCell
                          key={c.header}
                          className={cn(
                            "max-w-64 truncate",
                            i === 0 && "pl-4",
                            i === columns.length - 1 && "pr-4",
                            numeric(c.kind) && "text-right tabular-nums",
                            c.kind === "mono" && "font-mono text-xs",
                            !text && "text-muted-foreground",
                          )}
                          title={text.length > 30 ? text : undefined}
                        >
                          {text || "—"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            {rows.length > PREVIEW_ROWS
              ? `Showing the first ${PREVIEW_ROWS} of ${rows.length.toLocaleString("en-IN")} rows. Export to get all of them.`
              : `${rows.length.toLocaleString("en-IN")} row${rows.length === 1 ? "" : "s"}.`}
            {def.columns.some((c) => c.exportOnly) && " Excel and CSV exports include extra columns."}
          </p>
        </div>
      )}
    </>
  );
}
