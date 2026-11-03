import "server-only";
import { differenceInCalendarDays } from "date-fns";
import {
  BadgeIndianRupee,
  Boxes,
  Building2,
  CircleAlert,
  History,
  LogOut,
  PackageCheck,
  PackageOpen,
  ShieldAlert,
  ShoppingCart,
  Undo2,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { todayUtc } from "@/lib/dates";
import { bookValue, formatMoney } from "@/lib/depreciation";
import {
  ACKNOWLEDGEMENT,
  ASSET_CONDITION,
  ASSET_STATUS,
  EMPLOYMENT_STATUS,
  MAINTENANCE_STATUS,
  PRIORITY,
} from "@/lib/labels";
import type { FilterKey, ReportColumn, ReportFilters, ReportGroup, ReportSummary } from "./types";

// Every report: which filters apply, its columns (typed, so Excel/PDF can format
// them), and a loader. The page, Excel/CSV and PDF exports are all generic.

export type ReportDef<R = unknown> = {
  key: string;
  title: string;
  description: string;
  group: ReportGroup;
  icon: LucideIcon;
  filters: FilterKey[];
  /** What the from/to range applies to, shown next to the date inputs. */
  dateLabel?: string;
  statusOptions?: { value: string; label: string }[];
  columns: ReportColumn<R>[];
  load: (f: ReportFilters) => Promise<{ rows: R[]; summary: ReportSummary }>;
};

// The row type comes from `load`, so each definition lists `load` before
// `columns` (TypeScript fixes R in property order; NoInfer keeps columns out of it).
const define = <R,>(def: Omit<ReportDef<R>, "columns"> & { columns: ReportColumn<NoInfer<R>>[] }) => def as unknown as ReportDef;

const LIMIT = 50_000;
const label = (meta: Record<string, { label: string }>, v: string | null | undefined) => (v ? (meta[v]?.label ?? v) : "");
const sum = (ns: (number | null | undefined)[]) => ns.reduce<number>((a, n) => a + (n ?? 0), 0);
const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));
const count = (n: number, noun: string) => ({ label: noun, value: n.toLocaleString("en-IN") });
const range = (f: ReportFilters): Prisma.DateTimeFilter | undefined =>
  f.from || f.to ? { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } : undefined;

/** Assets owned by the department, or currently held by someone in it. */
const assetDept = (department?: string): Prisma.AssetWhereInput =>
  department ? { OR: [{ departmentId: department }, { assignments: { some: { status: "ACTIVE", employee: { departmentId: department } } } }] } : {};

const holder = {
  assignments: { where: { status: "ACTIVE" as const }, take: 1, select: { assignedAt: true, employee: { select: { fullName: true, employeeCode: true, department: { select: { name: true } } } } } },
};

const assetStatusOptions = Object.entries(ASSET_STATUS).map(([value, m]) => ({ value, label: m.label }));

// ─── Inventory ────────────────────────────────────────────────────────────────

const inventory = define({
  key: "inventory",
  title: "Complete asset inventory",
  description: "Every asset with its status, location, holder, cost and warranty.",
  group: "Inventory",
  icon: Boxes,
  filters: ["category", "status", "department"],
  statusOptions: assetStatusOptions,
  async load(f) {
    const rows = await db.asset.findMany({
      where: { deletedAt: null, categoryId: f.category, status: f.status as never, ...assetDept(f.department) },
      orderBy: { assetCode: "asc" },
      take: LIMIT,
      include: { category: true, branch: true, vendor: true, department: true, ...holder },
    });
    return {
      rows,
      summary: [count(rows.length, "Assets"), { label: "Total cost", value: formatMoney(sum(rows.map((r) => num(r.purchaseCost)))) }, count(rows.filter((r) => r.status === "ASSIGNED").length, "Assigned")],
    };
  },
  columns: [
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.assetCode },
    { header: "Asset", width: 22, value: (r) => r.name },
    { header: "Category", width: 13, value: (r) => r.category.name },
    { header: "Serial number", kind: "mono", width: 15, value: (r) => r.serialNumber },
    { header: "Status", kind: "status", width: 12, value: (r) => label(ASSET_STATUS, r.status) },
    { header: "Condition", width: 9, value: (r) => label(ASSET_CONDITION, r.condition) },
    { header: "Branch", width: 13, value: (r) => r.branch?.name },
    { header: "Assigned to", width: 16, value: (r) => r.assignments[0]?.employee.fullName },
    { header: "Purchased", kind: "date", width: 10, value: (r) => r.purchaseDate },
    { header: "Cost", kind: "money", width: 10, value: (r) => num(r.purchaseCost) },
    { header: "Warranty expiry", kind: "date", width: 10, value: (r) => r.warrantyExpiry },
    { header: "Vendor", width: 16, exportOnly: true, value: (r) => r.vendor?.name },
    { header: "Department", width: 14, exportOnly: true, value: (r) => r.department?.name },
  ],
});

const available = define({
  key: "available",
  title: "Available assets",
  description: "Stock ready to hand over, and how long each item has been idle.",
  group: "Inventory",
  icon: PackageOpen,
  filters: ["category", "department"],
  async load(f) {
    const assets = await db.asset.findMany({
      where: { deletedAt: null, status: "AVAILABLE", categoryId: f.category, ...(f.department && { departmentId: f.department }) },
      orderBy: [{ category: { name: "asc" } }, { assetCode: "asc" }],
      take: LIMIT,
      include: {
        category: true,
        branch: true,
        assignments: { where: { status: "RETURNED" }, orderBy: { assignedAt: "desc" }, take: 1, select: { return: { select: { returnedAt: true } } } },
      },
    });
    const today = todayUtc();
    const rows = assets.map((a) => {
      const since = a.assignments[0]?.return?.returnedAt ?? a.purchaseDate ?? a.createdAt;
      return { ...a, since, idle: differenceInCalendarDays(today, since) };
    });
    return { rows, summary: [count(rows.length, "Available"), { label: "Stock value", value: formatMoney(sum(rows.map((r) => num(r.purchaseCost)))) }] };
  },
  columns: [
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.assetCode },
    { header: "Asset", width: 24, value: (r) => r.name },
    { header: "Category", width: 14, value: (r) => r.category.name },
    { header: "Serial number", kind: "mono", width: 15, value: (r) => r.serialNumber },
    { header: "Condition", width: 10, value: (r) => label(ASSET_CONDITION, r.condition) },
    { header: "Branch", width: 14, value: (r) => r.branch?.name },
    { header: "In stock since", kind: "date", width: 11, value: (r) => r.since },
    { header: "Days idle", kind: "number", width: 8, value: (r) => r.idle },
    { header: "Cost", kind: "money", width: 10, value: (r) => num(r.purchaseCost) },
    { header: "Warranty expiry", kind: "date", width: 11, value: (r) => r.warrantyExpiry },
  ],
});

const assigned = define({
  key: "assigned",
  title: "Assigned assets",
  description: "Everything currently with employees, with handover and acknowledgement status.",
  group: "Inventory",
  icon: PackageCheck,
  filters: ["from", "to", "department", "category", "employee"],
  dateLabel: "Assigned between",
  async load(f) {
    const rows = await db.assetAssignment.findMany({
      where: {
        status: "ACTIVE",
        assignedAt: range(f),
        employeeId: f.employee,
        employee: f.department ? { departmentId: f.department } : undefined,
        asset: f.category ? { categoryId: f.category } : undefined,
      },
      orderBy: [{ employee: { fullName: "asc" } }, { assignedAt: "asc" }],
      take: LIMIT,
      include: { asset: { include: { category: true } }, employee: { include: { department: true } } },
    });
    const today = todayUtc();
    return {
      rows,
      summary: [
        count(rows.length, "Assigned"),
        count(new Set(rows.map((r) => r.employeeId)).size, "Employees"),
        count(rows.filter((r) => r.acknowledgement === "PENDING").length, "Not acknowledged"),
        count(rows.filter((r) => r.expectedReturnAt && r.expectedReturnAt < today).length, "Overdue"),
      ],
    };
  },
  columns: [
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.asset.assetCode },
    { header: "Asset", width: 20, value: (r) => r.asset.name },
    { header: "Category", width: 12, value: (r) => r.asset.category.name },
    { header: "Serial number", kind: "mono", width: 14, value: (r) => r.asset.serialNumber },
    { header: "Employee", width: 16, value: (r) => r.employee.fullName },
    { header: "Emp. ID", kind: "mono", width: 9, value: (r) => r.employee.employeeCode },
    { header: "Department", width: 13, value: (r) => r.employee.department?.name },
    { header: "Assigned", kind: "date", width: 10, value: (r) => r.assignedAt },
    { header: "Return by", kind: "date", width: 10, value: (r) => r.expectedReturnAt },
    { header: "Days held", kind: "number", width: 7, value: (r) => differenceInCalendarDays(todayUtc(), r.assignedAt) },
    { header: "Acknowledged", width: 11, value: (r) => label(ACKNOWLEDGEMENT, r.acknowledgement) },
    { header: "Accessories", width: 18, exportOnly: true, value: (r) => r.accessories.join(", ") },
  ],
});

const damaged = define({
  key: "damaged",
  title: "Damaged assets",
  description: "Assets marked damaged, with who last had them and recorded damage.",
  group: "Inventory",
  icon: CircleAlert,
  filters: ["category", "department"],
  async load(f) {
    const assets = await db.asset.findMany({
      where: { deletedAt: null, categoryId: f.category, ...assetDept(f.department), OR: [{ status: "DAMAGED" }, { condition: "DAMAGED", status: { notIn: ["DISPOSED", "RETIRED"] } }] },
      orderBy: { assetCode: "asc" },
      take: LIMIT,
      include: {
        category: true,
        assignments: {
          where: { status: "RETURNED" },
          orderBy: { assignedAt: "desc" },
          take: 1,
          select: { employee: { select: { fullName: true } }, return: { select: { returnedAt: true, damageNotes: true, deductionAmount: true } } },
        },
      },
    });
    const rows = assets.map((a) => ({
      ...a,
      last: a.assignments[0],
      book: bookValue({ cost: num(a.purchaseCost), purchaseDate: a.purchaseDate, usefulLifeMonths: a.category.usefulLifeMonths, salvagePercent: Number(a.category.salvagePercent) })?.value ?? null,
    }));
    return {
      rows,
      summary: [count(rows.length, "Damaged"), { label: "Book value at risk", value: formatMoney(sum(rows.map((r) => r.book))) }, { label: "Deductions recorded", value: formatMoney(sum(rows.map((r) => num(r.last?.return?.deductionAmount)))) }],
    };
  },
  columns: [
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.assetCode },
    { header: "Asset", width: 20, value: (r) => r.name },
    { header: "Category", width: 12, value: (r) => r.category.name },
    { header: "Serial number", kind: "mono", width: 14, value: (r) => r.serialNumber },
    { header: "Status", kind: "status", width: 10, value: (r) => label(ASSET_STATUS, r.status) },
    { header: "Last holder", width: 15, value: (r) => r.last?.employee.fullName },
    { header: "Returned", kind: "date", width: 10, value: (r) => r.last?.return?.returnedAt },
    { header: "Damage notes", width: 26, value: (r) => r.last?.return?.damageNotes },
    { header: "Deduction", kind: "money", width: 9, value: (r) => num(r.last?.return?.deductionAmount) },
    { header: "Cost", kind: "money", width: 10, value: (r) => num(r.purchaseCost) },
    { header: "Book value", kind: "money", width: 10, value: (r) => r.book },
  ],
});

const warranty = define({
  key: "warranty",
  title: "Warranty expiry",
  description: "Warranties ending in a period (next 90 days if no dates are chosen).",
  group: "Inventory",
  icon: ShieldAlert,
  filters: ["from", "to", "category", "department"],
  dateLabel: "Warranty ends between",
  async load(f) {
    const today = todayUtc();
    const from = f.from ?? (f.to ? undefined : today);
    const to = f.to ?? (f.from ? undefined : new Date(today.getTime() + 90 * 86_400_000));
    const rows = await db.asset.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ["DISPOSED", "LOST", "RETIRED"] },
        categoryId: f.category,
        ...assetDept(f.department),
        warrantyExpiry: { not: null, ...(from && { gte: from }), ...(to && { lte: to }) },
      },
      orderBy: { warrantyExpiry: "asc" },
      take: LIMIT,
      include: { category: true, vendor: true, ...holder },
    });
    return { rows, summary: [count(rows.length, "Warranties"), count(rows.filter((r) => r.warrantyExpiry! < today).length, "Already expired")] };
  },
  columns: [
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.assetCode },
    { header: "Asset", width: 22, value: (r) => r.name },
    { header: "Category", width: 13, value: (r) => r.category.name },
    { header: "Serial number", kind: "mono", width: 15, value: (r) => r.serialNumber },
    { header: "Vendor", width: 18, value: (r) => r.vendor?.name },
    { header: "Warranty expiry", kind: "date", width: 11, value: (r) => r.warrantyExpiry },
    { header: "Days left", kind: "number", width: 8, value: (r) => (r.warrantyExpiry ? differenceInCalendarDays(r.warrantyExpiry, todayUtc()) : null) },
    { header: "Status", kind: "status", width: 11, value: (r) => label(ASSET_STATUS, r.status) },
    { header: "Assigned to", width: 16, value: (r) => r.assignments[0]?.employee.fullName },
  ],
});

// ─── People ───────────────────────────────────────────────────────────────────

const employeeAllocation = define({
  key: "employee-allocation",
  title: "Employee-wise allocation",
  description: "What each employee holds right now, with asset values.",
  group: "People",
  icon: UserRound,
  filters: ["department", "employee", "category"],
  async load(f) {
    const rows = await db.assetAssignment.findMany({
      where: { status: "ACTIVE", employeeId: f.employee, employee: f.department ? { departmentId: f.department } : undefined, asset: f.category ? { categoryId: f.category } : undefined },
      orderBy: [{ employee: { fullName: "asc" } }, { asset: { assetCode: "asc" } }],
      take: LIMIT,
      include: { asset: { include: { category: true } }, employee: { include: { department: true, designation: true } } },
    });
    return {
      rows,
      summary: [count(new Set(rows.map((r) => r.employeeId)).size, "Employees"), count(rows.length, "Assets held"), { label: "Value held", value: formatMoney(sum(rows.map((r) => num(r.asset.purchaseCost)))) }],
    };
  },
  columns: [
    { header: "Emp. ID", kind: "mono", width: 9, value: (r) => r.employee.employeeCode },
    { header: "Employee", width: 17, value: (r) => r.employee.fullName },
    { header: "Department", width: 14, value: (r) => r.employee.department?.name },
    { header: "Designation", width: 16, value: (r) => r.employee.designation?.title },
    { header: "Status", width: 9, value: (r) => label(EMPLOYMENT_STATUS, r.employee.employmentStatus) },
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.asset.assetCode },
    { header: "Asset", width: 20, value: (r) => r.asset.name },
    { header: "Category", width: 12, value: (r) => r.asset.category.name },
    { header: "Serial number", kind: "mono", width: 14, value: (r) => r.asset.serialNumber },
    { header: "Assigned", kind: "date", width: 10, value: (r) => r.assignedAt },
    { header: "Value", kind: "money", width: 10, value: (r) => num(r.asset.purchaseCost) },
  ],
});

const department = define({
  key: "department",
  title: "Department-wise assets",
  description: "Headcount, assets held and their value for each department.",
  group: "People",
  icon: Building2,
  filters: ["category"],
  async load(f) {
    const [departments, active, owned] = await Promise.all([
      db.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { employees: { where: { deletedAt: null, employmentStatus: { not: "EXITED" } } } } } } }),
      db.assetAssignment.findMany({
        where: { status: "ACTIVE", asset: f.category ? { categoryId: f.category } : undefined },
        select: { employeeId: true, employee: { select: { departmentId: true } }, asset: { select: { purchaseCost: true } } },
      }),
      db.asset.groupBy({ by: ["departmentId"], where: { deletedAt: null, categoryId: f.category, departmentId: { not: null } }, _count: { _all: true } }),
    ]);
    const rows = departments.map((d) => {
      const mine = active.filter((a) => a.employee.departmentId === d.id);
      return {
        name: d.name,
        employees: d._count.employees,
        holders: new Set(mine.map((m) => m.employeeId)).size,
        held: mine.length,
        value: sum(mine.map((m) => num(m.asset.purchaseCost))),
        owned: owned.find((o) => o.departmentId === d.id)?._count._all ?? 0,
      };
    });
    return { rows, summary: [count(rows.length, "Departments"), count(sum(rows.map((r) => r.held)), "Assets held"), { label: "Value held", value: formatMoney(sum(rows.map((r) => r.value))) }] };
  },
  columns: [
    { header: "Department", width: 20, value: (r) => r.name },
    { header: "Active employees", kind: "number", width: 10, value: (r) => r.employees },
    { header: "Employees with assets", kind: "number", width: 10, value: (r) => r.holders },
    { header: "Assets held", kind: "number", width: 9, value: (r) => r.held },
    { header: "Value held", kind: "money", width: 12, value: (r) => r.value },
    { header: "Assets per employee", kind: "number", width: 10, value: (r) => (r.employees ? Math.round((r.held / r.employees) * 10) / 10 : 0) },
    { header: "Owned by department", kind: "number", width: 10, value: (r) => r.owned },
  ],
});

const exitClearance = define({
  key: "exit-clearance",
  title: "Employee exit clearance",
  description: "Leavers, the assets they held, and what was returned or recovered.",
  group: "People",
  icon: LogOut,
  filters: ["from", "to", "department"],
  dateLabel: "Last working day between",
  async load(f) {
    const rows = await db.employeeExitClearance.findMany({
      where: { lastWorkingDay: range(f), employee: f.department ? { departmentId: f.department } : undefined },
      orderBy: { lastWorkingDay: "desc" },
      take: LIMIT,
      include: { employee: { include: { department: true } }, items: true },
    });
    return {
      rows,
      summary: [count(rows.length, "Clearances"), count(rows.filter((r) => r.status === "COMPLETED").length, "Completed"), { label: "Recovered", value: formatMoney(sum(rows.flatMap((r) => r.items.map((i) => num(i.recoveryAmount))))) }],
    };
  },
  columns: [
    { header: "Emp. ID", kind: "mono", width: 9, value: (r) => r.employee.employeeCode },
    { header: "Employee", width: 17, value: (r) => r.employee.fullName },
    { header: "Department", width: 14, value: (r) => r.employee.department?.name },
    { header: "Last working day", kind: "date", width: 11, value: (r) => r.lastWorkingDay },
    { header: "Status", kind: "status", width: 11, value: (r) => r.status.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) },
    { header: "Assets", kind: "number", width: 7, value: (r) => r.items.length },
    { header: "Returned", kind: "number", width: 8, value: (r) => r.items.filter((i) => i.resolution === "RETURNED").length },
    { header: "Missing / damaged", kind: "number", width: 10, value: (r) => r.items.filter((i) => i.resolution === "MISSING" || i.resolution === "DAMAGED").length },
    { header: "Pending", kind: "number", width: 8, value: (r) => r.items.filter((i) => i.resolution === "PENDING").length },
    { header: "Recovery", kind: "money", width: 10, value: (r) => sum(r.items.map((i) => num(i.recoveryAmount))) },
    { header: "Completed", kind: "date", width: 10, value: (r) => r.completedAt },
  ],
});

// ─── Activity ─────────────────────────────────────────────────────────────────

const history = define({
  key: "assignment-history",
  title: "Assignment history",
  description: "Every handover in a period and whether, when and how it came back.",
  group: "Activity",
  icon: History,
  filters: ["from", "to", "department", "category", "employee"],
  dateLabel: "Assigned between",
  async load(f) {
    const rows = await db.assetAssignment.findMany({
      where: {
        assignedAt: range(f),
        employeeId: f.employee,
        employee: f.department ? { departmentId: f.department } : undefined,
        asset: f.category ? { categoryId: f.category } : undefined,
      },
      orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }],
      take: LIMIT,
      include: { asset: true, employee: { include: { department: true } }, assignedBy: { select: { name: true } }, return: true },
    });
    return { rows, summary: [count(rows.length, "Handovers"), count(rows.filter((r) => r.status === "RETURNED").length, "Returned"), count(rows.filter((r) => r.status === "ACTIVE").length, "Still out")] };
  },
  columns: [
    { header: "Assigned", kind: "date", width: 10, value: (r) => r.assignedAt },
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.asset.assetCode },
    { header: "Asset", width: 19, value: (r) => r.asset.name },
    { header: "Employee", width: 16, value: (r) => r.employee.fullName },
    { header: "Department", width: 13, value: (r) => r.employee.department?.name },
    { header: "Returned", kind: "date", width: 10, value: (r) => r.return?.returnedAt },
    { header: "Days", kind: "number", width: 6, value: (r) => differenceInCalendarDays(r.return?.returnedAt ?? todayUtc(), r.assignedAt) },
    { header: "Out", width: 8, value: (r) => label(ASSET_CONDITION, r.conditionAtHandover) },
    { header: "In", width: 8, value: (r) => label(ASSET_CONDITION, r.return?.conditionAtReturn) },
    { header: "Assigned by", width: 13, value: (r) => r.assignedBy.name },
    { header: "Status", kind: "status", width: 9, value: (r) => (r.status === "ACTIVE" ? "Active" : "Returned") },
  ],
});

const returns = define({
  key: "returns",
  title: "Asset returns",
  description: "Check-ins in a period with condition, missing items and deductions.",
  group: "Activity",
  icon: Undo2,
  filters: ["from", "to", "department", "category", "employee"],
  dateLabel: "Returned between",
  async load(f) {
    const rows = await db.assetReturn.findMany({
      where: {
        returnedAt: range(f),
        assignment: {
          employeeId: f.employee,
          employee: f.department ? { departmentId: f.department } : undefined,
          asset: f.category ? { categoryId: f.category } : undefined,
        },
      },
      orderBy: { returnedAt: "desc" },
      take: LIMIT,
      include: { assignment: { include: { asset: true, employee: { include: { department: true } } } }, processedBy: { select: { name: true } } },
    });
    return {
      rows,
      summary: [
        count(rows.length, "Returns"),
        count(rows.filter((r) => r.missingAccessories.length || r.damageNotes).length, "With issues"),
        { label: "Deductions", value: formatMoney(sum(rows.map((r) => num(r.deductionAmount)))) },
      ],
    };
  },
  columns: [
    { header: "Returned", kind: "date", width: 10, value: (r) => r.returnedAt },
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.assignment.asset.assetCode },
    { header: "Asset", width: 18, value: (r) => r.assignment.asset.name },
    { header: "Employee", width: 15, value: (r) => r.assignment.employee.fullName },
    { header: "Department", width: 12, value: (r) => r.assignment.employee.department?.name },
    { header: "Days held", kind: "number", width: 7, value: (r) => differenceInCalendarDays(r.returnedAt, r.assignment.assignedAt) },
    { header: "Condition", width: 9, value: (r) => label(ASSET_CONDITION, r.conditionAtReturn) },
    { header: "Missing", width: 14, value: (r) => r.missingAccessories.join(", ") },
    { header: "Damage", width: 18, value: (r) => r.damageNotes },
    { header: "Deduction", kind: "money", width: 9, value: (r) => num(r.deductionAmount) },
    { header: "Next status", kind: "status", width: 11, value: (r) => label(ASSET_STATUS, r.nextStatus) },
    { header: "Processed by", width: 13, exportOnly: true, value: (r) => r.processedBy.name },
  ],
});

const maintenance = define({
  key: "maintenance",
  title: "Maintenance",
  description: "Repair tickets opened in a period, turnaround and cost.",
  group: "Activity",
  icon: Wrench,
  filters: ["from", "to", "status", "category"],
  dateLabel: "Opened between",
  statusOptions: Object.entries(MAINTENANCE_STATUS).map(([value, m]) => ({ value, label: m.label })),
  async load(f) {
    const rows = await db.maintenanceRequest.findMany({
      where: { createdAt: range(f), status: f.status as never, asset: f.category ? { categoryId: f.category } : undefined },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: { asset: true, vendor: true, assignee: { select: { name: true } } },
    });
    const done = rows.filter((r) => r.completedAt);
    const avg = done.length ? Math.round(sum(done.map((r) => differenceInCalendarDays(r.completedAt!, r.startedAt ?? r.createdAt))) / done.length) : null;
    return {
      rows,
      summary: [
        count(rows.length, "Tickets"),
        count(rows.filter((r) => ["OPEN", "IN_PROGRESS", "PENDING_PARTS"].includes(r.status)).length, "Open"),
        { label: "Total cost", value: formatMoney(sum(rows.map((r) => num(r.cost)))) },
        { label: "Avg. turnaround", value: avg === null ? "—" : `${avg} days` },
      ],
    };
  },
  columns: [
    { header: "Ticket", kind: "mono", width: 11, value: (r) => r.ticketCode },
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.asset.assetCode },
    { header: "Asset", width: 17, value: (r) => r.asset.name },
    { header: "Issue", width: 24, value: (r) => r.issue },
    { header: "Priority", width: 8, value: (r) => label(PRIORITY, r.priority) },
    { header: "Status", kind: "status", width: 10, value: (r) => label(MAINTENANCE_STATUS, r.status) },
    { header: "Vendor", width: 14, value: (r) => r.vendor?.name },
    { header: "Opened", kind: "date", width: 10, value: (r) => r.createdAt },
    { header: "Completed", kind: "date", width: 10, value: (r) => r.completedAt },
    { header: "Days", kind: "number", width: 6, value: (r) => differenceInCalendarDays(r.completedAt ?? todayUtc(), r.startedAt ?? r.createdAt) },
    { header: "Cost", kind: "money", width: 10, value: (r) => num(r.cost) },
    { header: "Assigned to", width: 13, exportOnly: true, value: (r) => r.assignee?.name },
    { header: "Resolution", width: 24, exportOnly: true, value: (r) => r.resolutionNotes },
  ],
});

/** Plain-language names for audit actions recorded against assets. */
const ASSET_EVENT: Record<string, string> = {
  "asset.create": "Added",
  "asset.update": "Edited",
  "asset.status_change": "Status changed",
  "asset.archive": "Deleted",
  "asset.restore": "Restored",
  "asset.document_add": "Document added",
  "asset.document_delete": "Document removed",
  "assignment.create": "Assigned",
  "assignment.acknowledge": "Acknowledged",
  "assignment.return": "Returned",
  "assignment.document_add": "Handover file added",
  "maintenance.create": "Repair opened",
  "maintenance.update": "Repair updated",
  "maintenance.completed": "Repair completed",
  "maintenance.cancelled": "Repair cancelled",
  "clearance.item_missing": "Missing at exit",
  "clearance.item_waived": "Written off at exit",
};

const assetHistory = define({
  key: "asset-history",
  title: "Asset history",
  description: "The full life of each asset: added, assigned, returned, repaired, status changes and edits.",
  group: "Activity",
  icon: History,
  filters: ["asset", "from", "to", "category", "department"],
  dateLabel: "Events between",
  async load(f) {
    const assetWhere: Prisma.AssetWhereInput = { id: f.asset, categoryId: f.category, ...assetDept(f.department) };
    const scoped = f.asset || f.category || f.department;
    const assets = await db.asset.findMany({
      where: scoped ? assetWhere : undefined,
      select: { id: true, assetCode: true, name: true, serialNumber: true, category: { select: { name: true } } },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    const to = f.to ? new Date(f.to.getTime() + 86_400_000) : undefined;
    const logs = await db.auditLog.findMany({
      where: {
        entityType: "Asset",
        entityId: scoped ? { in: assets.map((a) => a.id) } : { not: "bulk" },
        createdAt: f.from || to ? { ...(f.from && { gte: f.from }), ...(to && { lt: to }) } : undefined,
      },
      orderBy: [{ entityId: "asc" }, { createdAt: "asc" }],
      take: LIMIT,
      select: { id: true, entityId: true, action: true, summary: true, createdAt: true, actor: { select: { name: true } } },
    });
    // One asset's story reads top to bottom; assets in ID order.
    const rows = logs
      .filter((l) => byId.has(l.entityId))
      .map((l) => ({ ...l, asset: byId.get(l.entityId)! }))
      .sort((a, b) => a.asset.assetCode.localeCompare(b.asset.assetCode) || a.createdAt.getTime() - b.createdAt.getTime());
    return {
      rows,
      summary: [
        count(rows.length, "Events"),
        count(new Set(rows.map((r) => r.entityId)).size, "Assets"),
        count(rows.filter((r) => r.action === "assignment.create").length, "Handovers"),
        count(rows.filter((r) => r.action.startsWith("maintenance.create")).length, "Repairs"),
      ],
    };
  },
  columns: [
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.asset.assetCode },
    { header: "Asset", width: 18, value: (r) => r.asset.name },
    { header: "When", kind: "datetime", width: 13, value: (r) => r.createdAt },
    { header: "Event", kind: "status", width: 13, value: (r) => ASSET_EVENT[r.action] ?? r.action },
    { header: "Details", width: 40, value: (r) => r.summary },
    { header: "By", width: 13, value: (r) => r.actor?.name ?? "System" },
    { header: "Category", width: 12, exportOnly: true, value: (r) => r.asset.category.name },
    { header: "Serial number", kind: "mono", width: 14, exportOnly: true, value: (r) => r.asset.serialNumber },
  ],
});

// ─── Finance ──────────────────────────────────────────────────────────────────

const procurement = define({
  key: "procurement",
  title: "Asset procurement",
  description: "Purchases in a period by date, vendor and invoice.",
  group: "Finance",
  icon: ShoppingCart,
  filters: ["from", "to", "category", "department"],
  dateLabel: "Purchased between",
  async load(f) {
    const rows = await db.asset.findMany({
      where: { deletedAt: null, purchaseDate: { not: null, ...range(f) }, categoryId: f.category, ...(f.department && { departmentId: f.department }) },
      orderBy: { purchaseDate: "desc" },
      take: LIMIT,
      include: { category: true, vendor: true },
    });
    const byVendor = new Map<string, number>();
    for (const r of rows) byVendor.set(r.vendor?.name ?? "No vendor", (byVendor.get(r.vendor?.name ?? "No vendor") ?? 0) + (num(r.purchaseCost) ?? 0));
    const top = [...byVendor.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      rows,
      summary: [count(rows.length, "Assets bought"), { label: "Total spend", value: formatMoney(sum(rows.map((r) => num(r.purchaseCost)))) }, { label: "Top vendor", value: top ? `${top[0]} (${formatMoney(top[1])})` : "—" }],
    };
  },
  columns: [
    { header: "Purchased", kind: "date", width: 10, value: (r) => r.purchaseDate },
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.assetCode },
    { header: "Asset", width: 22, value: (r) => r.name },
    { header: "Category", width: 13, value: (r) => r.category.name },
    { header: "Vendor", width: 18, value: (r) => r.vendor?.name },
    { header: "Invoice no.", kind: "mono", width: 13, value: (r) => r.invoiceNumber },
    { header: "Serial number", kind: "mono", width: 14, value: (r) => r.serialNumber },
    { header: "Cost", kind: "money", width: 10, value: (r) => num(r.purchaseCost) },
    { header: "Status", kind: "status", width: 10, value: (r) => label(ASSET_STATUS, r.status) },
  ],
});

const depreciation = define({
  key: "depreciation",
  title: "Asset depreciation",
  description: "Straight-line book value per asset, as of today or the chosen end date.",
  group: "Finance",
  icon: BadgeIndianRupee,
  filters: ["to", "category", "department", "status"],
  dateLabel: "Value as of",
  statusOptions: assetStatusOptions,
  async load(f) {
    const asOf = f.to ?? todayUtc();
    const assets = await db.asset.findMany({
      where: { deletedAt: null, purchaseCost: { not: null }, purchaseDate: { not: null, lte: asOf }, categoryId: f.category, status: f.status as never, ...assetDept(f.department) },
      orderBy: { assetCode: "asc" },
      take: LIMIT,
      include: { category: true },
    });
    const rows = assets.map((a) => ({
      ...a,
      dep: bookValue({ cost: num(a.purchaseCost), purchaseDate: a.purchaseDate, usefulLifeMonths: a.category.usefulLifeMonths, salvagePercent: Number(a.category.salvagePercent), asOf }),
    }));
    return {
      rows,
      summary: [
        count(rows.length, "Assets"),
        { label: "Original cost", value: formatMoney(sum(rows.map((r) => num(r.purchaseCost)))) },
        { label: "Accumulated", value: formatMoney(sum(rows.map((r) => r.dep?.accumulated))) },
        { label: "Book value", value: formatMoney(sum(rows.map((r) => r.dep?.value))) },
      ],
    };
  },
  columns: [
    { header: "Asset ID", kind: "mono", width: 11, value: (r) => r.assetCode },
    { header: "Asset", width: 20, value: (r) => r.name },
    { header: "Category", width: 12, value: (r) => r.category.name },
    { header: "Purchased", kind: "date", width: 10, value: (r) => r.purchaseDate },
    { header: "Cost", kind: "money", width: 10, value: (r) => num(r.purchaseCost) },
    { header: "Life (months)", kind: "number", width: 8, value: (r) => r.category.usefulLifeMonths },
    { header: "Months used", kind: "number", width: 8, value: (r) => r.dep?.monthsElapsed },
    { header: "Accumulated", kind: "money", width: 11, value: (r) => r.dep?.accumulated },
    { header: "Book value", kind: "money", width: 11, value: (r) => r.dep?.value },
    { header: "Status", kind: "status", width: 10, value: (r) => label(ASSET_STATUS, r.status) },
  ],
});

export const REPORTS: ReportDef[] = [
  inventory,
  available,
  assigned,
  damaged,
  warranty,
  employeeAllocation,
  department,
  exitClearance,
  history,
  assetHistory,
  returns,
  maintenance,
  procurement,
  depreciation,
];

export const REPORT_GROUPS = ["Inventory", "People", "Activity", "Finance"] as const;

export function getReport(key: string) {
  return REPORTS.find((r) => r.key === key);
}
