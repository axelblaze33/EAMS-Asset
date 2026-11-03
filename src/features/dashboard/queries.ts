import "server-only";
import { format } from "date-fns";
import { Prisma, type AssetStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { param, type SearchParams } from "@/lib/list-params";

export const RANGES = { "3": "Last 3 months", "6": "Last 6 months", "12": "Last 12 months", "24": "Last 24 months" } as const;
export type RangeKey = keyof typeof RANGES;

export function dashboardFilters(sp: SearchParams) {
  const r = param(sp, "range");
  const range: RangeKey = r && r in RANGES ? (r as RangeKey) : "12";
  const months = Number(range);
  const now = new Date();
  // First day of the month, `months - 1` months ago, so the current month is included.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  return { range, months, from, department: param(sp, "department") };
}
type Filters = ReturnType<typeof dashboardFilters>;

/** Assets owned by the department, or currently held by someone in it. */
function assetScope(department?: string): Prisma.AssetWhereInput {
  return {
    deletedAt: null,
    ...(department && {
      OR: [{ departmentId: department }, { assignments: { some: { status: "ACTIVE", employee: { departmentId: department } } } }],
    }),
  };
}

export async function getKpis(f: Pick<Filters, "department">) {
  const [byStatus, employees, pendingRequests] = await Promise.all([
    db.asset.groupBy({ by: ["status"], where: assetScope(f.department), _count: { _all: true } }),
    db.employee.count({ where: { deletedAt: null, employmentStatus: { not: "EXITED" }, departmentId: f.department } }),
    db.assetRequest.count({ where: { status: "PENDING", employee: { departmentId: f.department } } }),
  ]);

  const count = (...statuses: AssetStatus[]) =>
    byStatus.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);

  return {
    total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
    available: count("AVAILABLE"),
    assigned: count("ASSIGNED"),
    maintenance: count("UNDER_MAINTENANCE"),
    damaged: count("DAMAGED"),
    retired: count("RETIRED", "DISPOSED"),
    lost: count("LOST"),
    employees,
    pendingRequests,
  };
}

export async function getDistributions(f: Pick<Filters, "department">) {
  const where = assetScope(f.department);
  const [byCategory, byStatus, categories, byDepartment] = await Promise.all([
    db.asset.groupBy({ by: ["categoryId"], where, _count: { _all: true } }),
    db.asset.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.assetCategory.findMany({ select: { id: true, name: true } }),
    // Allocation = assets currently held, grouped by the holder's department.
    db.$queryRaw<{ name: string | null; count: bigint }[]>`
      SELECT d.name, COUNT(*)::bigint AS count
      FROM asset_assignments aa
      JOIN employees e ON e.id = aa.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE aa.status = 'ACTIVE'
        ${f.department ? Prisma.sql`AND e.department_id = ${f.department}` : Prisma.empty}
      GROUP BY d.name`,
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const desc = <T extends { value: number }>(rows: T[]) => rows.sort((a, b) => b.value - a.value);

  return {
    byCategory: desc(byCategory.map((r) => ({ label: catName.get(r.categoryId) ?? "Unknown", value: r._count._all }))),
    byStatus: desc(byStatus.map((r) => ({ status: r.status, value: r._count._all }))),
    byDepartment: desc(byDepartment.map((r) => ({ label: r.name ?? "No department", value: Number(r.count) }))),
  };
}

function monthBuckets(from: Date, months: number) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    return { key: d.toISOString().slice(0, 7), label: format(d, months > 12 ? "MMM yy" : "MMM") };
  });
}

export async function getTrends(f: Filters) {
  const dept = f.department ? Prisma.sql`AND e.department_id = ${f.department}` : Prisma.empty;
  const [assigned, returned, procured] = await Promise.all([
    db.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT to_char(aa.assigned_at, 'YYYY-MM') AS month, COUNT(*)::bigint AS count
      FROM asset_assignments aa JOIN employees e ON e.id = aa.employee_id
      WHERE aa.assigned_at >= ${f.from} ${dept}
      GROUP BY 1`,
    db.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT to_char(r.returned_at, 'YYYY-MM') AS month, COUNT(*)::bigint AS count
      FROM asset_returns r
      JOIN asset_assignments aa ON aa.id = r.assignment_id
      JOIN employees e ON e.id = aa.employee_id
      WHERE r.returned_at >= ${f.from} ${dept}
      GROUP BY 1`,
    db.$queryRaw<{ month: string; count: bigint; spend: Prisma.Decimal | null }[]>`
      SELECT to_char(a.purchase_date, 'YYYY-MM') AS month, COUNT(*)::bigint AS count, SUM(a.purchase_cost) AS spend
      FROM assets a
      WHERE a.deleted_at IS NULL AND a.purchase_date >= ${f.from}
        ${f.department ? Prisma.sql`AND a.department_id = ${f.department}` : Prisma.empty}
      GROUP BY 1`,
  ]);

  const toMap = <T extends { month: string }>(rows: T[]) => new Map(rows.map((r) => [r.month, r]));
  const a = toMap(assigned);
  const r = toMap(returned);
  const p = toMap(procured);

  return monthBuckets(f.from, f.months).map(({ key, label }) => ({
    month: label,
    assignments: Number(a.get(key)?.count ?? 0),
    returns: Number(r.get(key)?.count ?? 0),
    purchased: Number(p.get(key)?.count ?? 0),
    spend: Number(p.get(key)?.spend ?? 0),
  }));
}

const ACTIVITY_ENTITIES = ["Asset", "AssetAssignment", "AssetReturn", "MaintenanceRequest"];

export async function getRecentActivity(f: Filters) {
  return db.auditLog.findMany({
    where: { entityType: { in: ACTIVITY_ENTITIES }, entityId: { not: "bulk" }, createdAt: { gte: f.from } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, action: true, summary: true, entityType: true, entityId: true, createdAt: true, actor: { select: { name: true } } },
  });
}

/** Things someone should act on; each maps to a filtered list. */
export async function getAttention(f: Pick<Filters, "department">) {
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const in30 = new Date(today.getTime() + 30 * 86_400_000);
  const staleTicket = new Date(Date.now() - 14 * 86_400_000);
  const emp = f.department ? { departmentId: f.department } : undefined;
  const [overdue, unacknowledged, pendingRequests, approvedRequests, staleTickets, warranties] = await Promise.all([
    db.assetAssignment.count({ where: { status: "ACTIVE", expectedReturnAt: { lt: today }, employee: emp } }),
    db.assetAssignment.count({ where: { status: "ACTIVE", acknowledgement: "PENDING", employee: emp } }),
    db.assetRequest.count({ where: { status: "PENDING", employee: emp } }),
    db.assetRequest.count({ where: { status: "APPROVED", employee: emp } }),
    db.maintenanceRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "PENDING_PARTS"] }, createdAt: { lt: staleTicket } } }),
    db.asset.count({
      where: { ...assetScope(f.department), status: { notIn: ["RETIRED", "DISPOSED", "LOST"] }, warrantyExpiry: { gte: today, lte: in30 } },
    }),
  ]);
  return { overdue, unacknowledged, pendingRequests, approvedRequests, staleTickets, warranties };
}
