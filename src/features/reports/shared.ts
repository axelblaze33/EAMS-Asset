import "server-only";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";
import { formatMoney } from "@/lib/depreciation";
import { param, type SearchParams } from "@/lib/list-params";
import type { ReportDef } from "./registry";
import type { ColumnKind, ReportFilters } from "./types";

/** Reads only the filters this report supports; invalid values are ignored. */
export function parseReportFilters(def: ReportDef, sp: SearchParams): ReportFilters {
  const has = (k: string) => def.filters.includes(k as never);
  const date = (k: string) => {
    const v = param(sp, k);
    return v ? (parseDateInput(v) ?? undefined) : undefined;
  };
  const status = param(sp, "status");
  return {
    from: has("from") ? date("from") : undefined,
    to: has("to") ? date("to") : undefined,
    department: has("department") ? param(sp, "department") : undefined,
    category: has("category") ? param(sp, "category") : undefined,
    employee: has("employee") ? param(sp, "employee") : undefined,
    asset: has("asset") ? param(sp, "asset") : undefined,
    status: has("status") && status && def.statusOptions?.some((o) => o.value === status) ? status : undefined,
  };
}

/** Human-readable line describing the applied filters (for exports). */
export async function describeFilters(def: ReportDef, f: ReportFilters) {
  const [dept, cat, emp, asset] = await Promise.all([
    f.department ? db.department.findUnique({ where: { id: f.department }, select: { name: true } }) : null,
    f.category ? db.assetCategory.findUnique({ where: { id: f.category }, select: { name: true } }) : null,
    f.employee ? db.employee.findUnique({ where: { id: f.employee }, select: { fullName: true, employeeCode: true } }) : null,
    f.asset ? db.asset.findUnique({ where: { id: f.asset }, select: { assetCode: true, name: true } }) : null,
  ]);
  const d = (x: Date) => format(x, "d MMM yyyy");
  const parts: string[] = [];
  if (f.from && f.to) parts.push(`${def.dateLabel ?? "Between"} ${d(f.from)} and ${d(f.to)}`);
  else if (f.from) parts.push(`${def.dateLabel ?? "From"} ${d(f.from)} onwards`);
  else if (f.to) parts.push(def.filters.includes("from") ? `${def.dateLabel ?? "Until"} up to ${d(f.to)}` : `${def.dateLabel ?? "As of"} ${d(f.to)}`);
  if (dept) parts.push(`Department: ${dept.name}`);
  if (cat) parts.push(`Category: ${cat.name}`);
  if (asset) parts.push(`Asset: ${asset.assetCode} ${asset.name}`);
  if (emp) parts.push(`Employee: ${emp.fullName} (${emp.employeeCode})`);
  if (f.status) parts.push(`Status: ${def.statusOptions?.find((o) => o.value === f.status)?.label ?? f.status}`);
  return parts.length ? parts.join(" · ") : "All records";
}

export function formatCell(kind: ColumnKind | undefined, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (kind === "money") return formatMoney(Number(v));
  if (kind === "date") return v instanceof Date ? format(v, "d MMM yyyy") : String(v);
  if (kind === "datetime") return v instanceof Date ? format(v, "d MMM yyyy, HH:mm") : String(v);
  if (kind === "number") return typeof v === "number" ? v.toLocaleString("en-IN") : String(v);
  return String(v);
}

export const EXCEL_FORMAT: Partial<Record<ColumnKind, string>> = {
  money: '"₹"#,##,##0.00',
  date: "dd-mmm-yyyy",
  datetime: "dd-mmm-yyyy hh:mm",
  number: "#,##0.##",
};
