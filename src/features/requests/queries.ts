import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { enumParam, param, parseList, type SearchParams } from "@/lib/list-params";

export const REQUEST_VIEWS = ["pending", "approved", "fulfilled", "closed", "all"] as const;
export type RequestView = (typeof REQUEST_VIEWS)[number];

export function requestFilters(sp: SearchParams) {
  return {
    ...parseList(sp, { sortable: ["createdAt", "priority"] as const, defaultSort: "createdAt", defaultDir: "desc" }),
    view: enumParam(sp, "view", REQUEST_VIEWS) ?? "pending",
    category: param(sp, "category"),
    department: param(sp, "department"),
  };
}
type Filters = ReturnType<typeof requestFilters>;

export function requestWhere(f: Pick<Filters, "view" | "category" | "department" | "q">): Prisma.AssetRequestWhereInput {
  return {
    status:
      f.view === "pending"
        ? "PENDING"
        : f.view === "approved"
          ? "APPROVED"
          : f.view === "fulfilled"
            ? "FULFILLED"
            : f.view === "closed"
              ? { in: ["REJECTED", "CANCELLED"] }
              : undefined,
    categoryId: f.category,
    employee: f.department ? { departmentId: f.department } : undefined,
    ...(f.q && {
      OR: [
        { requestCode: { contains: f.q, mode: "insensitive" } },
        { reason: { contains: f.q, mode: "insensitive" } },
        { employee: { fullName: { contains: f.q, mode: "insensitive" } } },
        { employee: { employeeCode: { contains: f.q, mode: "insensitive" } } },
      ],
    }),
  };
}

export async function listRequests(f: Filters) {
  const where = requestWhere(f);
  const orderBy: Prisma.AssetRequestOrderByWithRelationInput[] = f.sort === "priority" ? [{ priority: f.dir }, { createdAt: "asc" }] : [{ createdAt: f.dir }];
  const [rows, total, counts, available] = await Promise.all([
    db.assetRequest.findMany({
      where,
      orderBy,
      skip: f.skip,
      take: f.pageSize,
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
        category: { select: { id: true, name: true } },
        requestedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
        assignment: { select: { id: true, batchId: true, asset: { select: { id: true, assetCode: true } } } },
      },
    }),
    db.assetRequest.count({ where }),
    Promise.all(REQUEST_VIEWS.map((view) => db.assetRequest.count({ where: requestWhere({ ...f, view }) }))),
    // Stock per category, so approvers can see whether a request can be met now.
    db.asset.groupBy({ by: ["categoryId"], where: { deletedAt: null, status: "AVAILABLE" }, _count: { _all: true } }),
  ]);
  return {
    rows,
    total,
    counts: Object.fromEntries(REQUEST_VIEWS.map((v, i) => [v, counts[i]!])) as Record<RequestView, number>,
    stock: Object.fromEntries(available.map((a) => [a.categoryId, a._count._all])) as Record<string, number>,
  };
}
