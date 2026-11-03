import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { authorizeRoute } from "@/lib/route-auth";
import { fileResponse, toCsv, toXlsx, type ExportColumn } from "@/lib/spreadsheet";
import { ASSET_CONDITION, ASSET_STATUS } from "@/lib/labels";
import { assetFilters, assetListSelect, assetWhere } from "@/features/assets/queries";

type Row = Awaited<ReturnType<typeof load>>[number];

function load(where: ReturnType<typeof assetWhere>) {
  return db.asset.findMany({ where, orderBy: { assetCode: "asc" }, select: assetListSelect, take: 50_000 });
}

// Column names match the import template so an export can be edited and re-imported.
const COLUMNS: ExportColumn<Row>[] = [
  { header: "Asset ID", value: (r) => r.assetCode },
  { header: "Asset Name", width: 28, value: (r) => r.name },
  { header: "Category", width: 16, value: (r) => r.category.name },
  { header: "Brand", value: (r) => r.brand },
  { header: "Model", width: 20, value: (r) => r.model },
  { header: "Serial Number", width: 20, value: (r) => r.serialNumber },
  { header: "Asset Tag", value: (r) => r.assetTag },
  { header: "Purchase Date", value: (r) => r.purchaseDate },
  { header: "Purchase Cost", value: (r) => (r.purchaseCost ? Number(r.purchaseCost) : null) },
  { header: "Vendor", width: 24, value: (r) => r.vendor?.name },
  { header: "Invoice Number", value: (r) => r.invoiceNumber },
  { header: "Warranty Start", value: (r) => r.warrantyStart },
  { header: "Warranty Expiry", value: (r) => r.warrantyExpiry },
  { header: "Condition", value: (r) => ASSET_CONDITION[r.condition].label },
  { header: "Status", value: (r) => ASSET_STATUS[r.status].label },
  { header: "Branch", width: 18, value: (r) => r.branch?.name },
  { header: "Department", width: 18, value: (r) => r.department?.name },
  { header: "Assigned To", width: 24, value: (r) => r.assignments[0]?.employee.fullName },
  { header: "Assigned Employee ID", value: (r) => r.assignments[0]?.employee.employeeCode },
  { header: "Assigned Since", value: (r) => r.assignments[0]?.assignedAt },
  {
    header: "Specifications",
    width: 40,
    value: (r) =>
      Object.entries((r.specifications as Record<string, string> | null) ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join("; "),
  },
  { header: "Description", width: 30, value: (r) => r.description },
];

export async function GET(req: NextRequest) {
  const { denied } = await authorizeRoute("asset:read");
  if (denied) return denied;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const rows = await load(assetWhere(assetFilters(sp)));
  const format = sp.format === "csv" ? "csv" : "xlsx";
  const stamp = new Date().toISOString().slice(0, 10);
  return format === "csv"
    ? fileResponse(toCsv(COLUMNS, rows), `assets-${stamp}.csv`, "csv")
    : fileResponse(await toXlsx("Assets", COLUMNS, rows), `assets-${stamp}.xlsx`, "xlsx");
}
