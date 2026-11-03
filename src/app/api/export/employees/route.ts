import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { authorizeRoute } from "@/lib/route-auth";
import { fileResponse, toCsv, toXlsx, type ExportColumn } from "@/lib/spreadsheet";
import { EMPLOYMENT_STATUS } from "@/lib/labels";
import { employeeFilters, employeeListSelect, employeeWhere } from "@/features/employees/queries";

type Row = Awaited<ReturnType<typeof load>>[number];

function load(where: ReturnType<typeof employeeWhere>) {
  return db.employee.findMany({ where, orderBy: { fullName: "asc" }, select: employeeListSelect, take: 50_000 });
}

const COLUMNS: ExportColumn<Row>[] = [
  { header: "Employee ID", value: (r) => r.employeeCode },
  { header: "Full Name", width: 24, value: (r) => r.fullName },
  { header: "Email", width: 30, value: (r) => r.email },
  { header: "Contact Number", width: 18, value: (r) => r.phone },
  { header: "Department", width: 18, value: (r) => r.department?.name },
  { header: "Designation", width: 24, value: (r) => r.designation?.title },
  { header: "Branch", width: 18, value: (r) => r.branch?.name },
  { header: "Reporting Manager", value: (r) => r.manager?.employeeCode },
  { header: "Joining Date", value: (r) => r.joiningDate },
  { header: "Status", value: (r) => EMPLOYMENT_STATUS[r.employmentStatus].label },
  { header: "Assets Held", value: (r) => r._count.assignments },
];

export async function GET(req: NextRequest) {
  const { denied } = await authorizeRoute("employee:read");
  if (denied) return denied;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const rows = await load(employeeWhere(employeeFilters(sp)));
  const format = sp.format === "csv" ? "csv" : "xlsx";
  const stamp = new Date().toISOString().slice(0, 10);
  return format === "csv"
    ? fileResponse(toCsv(COLUMNS, rows), `employees-${stamp}.csv`, "csv")
    : fileResponse(await toXlsx("Employees", COLUMNS, rows), `employees-${stamp}.xlsx`, "xlsx");
}
