import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { todayUtc } from "@/lib/dates";
import { enumParam, param, parseList, type SearchParams } from "@/lib/list-params";

export const ASSIGNMENT_VIEWS = ["active", "pending", "overdue", "returned", "all"] as const;
export type AssignmentView = (typeof ASSIGNMENT_VIEWS)[number];

export function assignmentFilters(sp: SearchParams) {
  return {
    ...parseList(sp, { sortable: ["assignedAt", "expectedReturnAt", "employee"] as const, defaultSort: "assignedAt", defaultDir: "desc" }),
    view: enumParam(sp, "view", ASSIGNMENT_VIEWS) ?? "active",
    department: param(sp, "department"),
  };
}
type Filters = ReturnType<typeof assignmentFilters>;

export function assignmentWhere(f: Pick<Filters, "view" | "department" | "q">): Prisma.AssetAssignmentWhereInput {
  const view: Prisma.AssetAssignmentWhereInput =
    f.view === "active"
      ? { status: "ACTIVE" }
      : f.view === "pending"
        ? { status: "ACTIVE", acknowledgement: "PENDING" }
        : f.view === "overdue"
          ? { status: "ACTIVE", expectedReturnAt: { lt: todayUtc() } }
          : f.view === "returned"
            ? { status: "RETURNED" }
            : {};
  return {
    ...view,
    employee: f.department ? { departmentId: f.department } : undefined,
    ...(f.q && {
      OR: [
        { asset: { assetCode: { contains: f.q, mode: "insensitive" } } },
        { asset: { name: { contains: f.q, mode: "insensitive" } } },
        { asset: { serialNumber: { contains: f.q, mode: "insensitive" } } },
        { employee: { fullName: { contains: f.q, mode: "insensitive" } } },
        { employee: { employeeCode: { contains: f.q, mode: "insensitive" } } },
      ],
    }),
  };
}

export async function listAssignments(f: Filters) {
  const where = assignmentWhere(f);
  const orderBy: Prisma.AssetAssignmentOrderByWithRelationInput[] =
    f.sort === "employee"
      ? [{ employee: { fullName: f.dir } }]
      : f.sort === "expectedReturnAt"
        ? [{ expectedReturnAt: { sort: f.dir, nulls: "last" } }]
        : [{ assignedAt: f.dir }, { createdAt: f.dir }];
  const [rows, total, counts] = await Promise.all([
    db.assetAssignment.findMany({
      where,
      orderBy,
      skip: f.skip,
      take: f.pageSize,
      select: {
        id: true,
        batchId: true,
        assignedAt: true,
        expectedReturnAt: true,
        status: true,
        acknowledgement: true,
        accessories: true,
        asset: { select: { id: true, assetCode: true, name: true, category: { select: { name: true } } } },
        employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
        return: { select: { returnedAt: true, conditionAtReturn: true } },
      },
    }),
    db.assetAssignment.count({ where }),
    Promise.all(ASSIGNMENT_VIEWS.map((view) => db.assetAssignment.count({ where: assignmentWhere({ view, department: f.department, q: f.q }) }))),
  ]);
  return { rows, total, counts: Object.fromEntries(ASSIGNMENT_VIEWS.map((v, i) => [v, counts[i]!])) as Record<AssignmentView, number> };
}

/** Everything on one handover form: a batch id, or a single assignment id for older records. */
export async function getHandover(ref: string) {
  const rows = await db.assetAssignment.findMany({
    where: { OR: [{ batchId: ref }, { id: ref }] },
    orderBy: { createdAt: "asc" },
    include: {
      asset: { select: { id: true, assetCode: true, name: true, brand: true, model: true, serialNumber: true, category: { select: { name: true } } } },
      employee: {
        select: {
          id: true,
          fullName: true,
          employeeCode: true,
          email: true,
          department: { select: { name: true } },
          designation: { select: { title: true } },
          branch: { select: { name: true } },
        },
      },
      assignedBy: { select: { name: true } },
      acknowledgedBy: { select: { name: true } },
      documents: { select: { id: true, fileName: true, type: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedBy: { select: { name: true } } } },
    },
  });
  if (rows.length === 0) return null;
  return { ref, employee: rows[0]!.employee, assignedBy: rows[0]!.assignedBy, assignedAt: rows[0]!.assignedAt, expectedReturnAt: rows[0]!.expectedReturnAt, remarks: rows[0]!.remarks, items: rows };
}
export type Handover = NonNullable<Awaited<ReturnType<typeof getHandover>>>;

export async function getAssignmentForReturn(id: string) {
  return db.assetAssignment.findUnique({
    where: { id },
    include: {
      asset: { select: { id: true, assetCode: true, name: true, serialNumber: true, condition: true, status: true, category: { select: { name: true } } } },
      employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
      assignedBy: { select: { name: true } },
    },
  });
}

/** Pickers for the assign form. */
export async function getAssignOptions() {
  const [employees, assets] = await Promise.all([
    db.employee.findMany({
      where: { deletedAt: null, employmentStatus: { not: "EXITED" } },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        employmentStatus: true,
        department: { select: { name: true } },
        _count: { select: { assignments: { where: { status: "ACTIVE" } } } },
      },
    }),
    db.asset.findMany({
      where: { deletedAt: null, status: "AVAILABLE" },
      orderBy: [{ category: { name: "asc" } }, { assetCode: "asc" }],
      select: { id: true, assetCode: true, name: true, serialNumber: true, condition: true, category: { select: { name: true } }, branch: { select: { name: true } } },
    }),
  ]);
  return { employees, assets };
}
export type AssignOptions = Awaited<ReturnType<typeof getAssignOptions>>;
