import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { enumParam, param, parseList, type SearchParams } from "@/lib/list-params";
import { EMPLOYMENT_STATUSES } from "./schemas";

export const EMPLOYEE_SORTS = ["name", "code", "department", "joiningDate", "status"] as const;

export function employeeFilters(sp: SearchParams) {
  return {
    ...parseList(sp, { sortable: EMPLOYEE_SORTS, defaultSort: "name" }),
    department: param(sp, "department"),
    branch: param(sp, "branch"),
    status: enumParam(sp, "status", EMPLOYMENT_STATUSES),
  };
}
type Filters = ReturnType<typeof employeeFilters>;

export function employeeWhere(f: Omit<Filters, "page" | "pageSize" | "skip" | "sort" | "dir">): Prisma.EmployeeWhereInput {
  return {
    deletedAt: null,
    departmentId: f.department,
    branchId: f.branch,
    employmentStatus: f.status,
    ...(f.q && {
      OR: [
        { fullName: { contains: f.q, mode: "insensitive" } },
        { employeeCode: { contains: f.q, mode: "insensitive" } },
        { email: { contains: f.q, mode: "insensitive" } },
        { phone: { contains: f.q } },
      ],
    }),
  };
}

function orderBy(sort: Filters["sort"], dir: Filters["dir"]): Prisma.EmployeeOrderByWithRelationInput[] {
  switch (sort) {
    case "code":
      return [{ employeeCode: dir }];
    case "department":
      return [{ department: { name: dir } }, { fullName: "asc" }];
    case "joiningDate":
      return [{ joiningDate: { sort: dir, nulls: "last" } }, { fullName: "asc" }];
    case "status":
      return [{ employmentStatus: dir }, { fullName: "asc" }];
    default:
      return [{ fullName: dir }];
  }
}

export const employeeListSelect = {
  id: true,
  employeeCode: true,
  fullName: true,
  email: true,
  phone: true,
  joiningDate: true,
  employmentStatus: true,
  department: { select: { name: true } },
  designation: { select: { title: true } },
  branch: { select: { name: true } },
  manager: { select: { fullName: true, employeeCode: true } },
  _count: { select: { assignments: { where: { status: "ACTIVE" } } } },
} satisfies Prisma.EmployeeSelect;

export async function listEmployees(f: Filters) {
  const where = employeeWhere(f);
  const [rows, total] = await Promise.all([
    db.employee.findMany({ where, orderBy: orderBy(f.sort, f.dir), skip: f.skip, take: f.pageSize, select: employeeListSelect }),
    db.employee.count({ where }),
  ]);
  return { rows, total };
}

export async function getEmployee(id: string) {
  return db.employee.findFirst({
    where: { id, deletedAt: null },
    include: {
      department: true,
      designation: true,
      branch: true,
      manager: { select: { id: true, fullName: true, employeeCode: true } },
      reports: { where: { deletedAt: null }, select: { id: true, fullName: true, employeeCode: true }, orderBy: { fullName: "asc" } },
      user: { select: { email: true, isActive: true, role: { select: { name: true } } } },
      clearances: { where: { status: { in: ["INITIATED", "IN_PROGRESS"] } }, select: { id: true } },
      assignments: {
        orderBy: [{ status: "asc" }, { assignedAt: "desc" }],
        include: {
          asset: { select: { id: true, assetCode: true, name: true, serialNumber: true, category: { select: { name: true } } } },
          return: { select: { returnedAt: true, conditionAtReturn: true, missingAccessories: true, damageNotes: true } },
          assignedBy: { select: { name: true } },
        },
      },
      requests: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { category: { select: { name: true } } },
      },
    },
  });
}

export async function listManagerOptions(excludeId?: string) {
  const rows = await db.employee.findMany({
    where: { deletedAt: null, employmentStatus: { not: "EXITED" }, id: excludeId ? { not: excludeId } : undefined },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, employeeCode: true },
  });
  return rows.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }));
}
