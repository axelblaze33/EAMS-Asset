import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { todayUtc } from "@/lib/dates";
import { enumParam, param, parseList, type SearchParams } from "@/lib/list-params";
import { ASSET_STATUSES } from "./schemas";

export const ASSET_SORTS = ["code", "name", "category", "status", "purchaseDate", "cost", "warranty"] as const;
export const WARRANTY_FILTERS = ["expired", "30", "60", "90"] as const;

export function assetFilters(sp: SearchParams) {
  return {
    ...parseList(sp, { sortable: ASSET_SORTS, defaultSort: "code", defaultDir: "desc" }),
    category: param(sp, "category"),
    status: enumParam(sp, "status", ASSET_STATUSES),
    branch: param(sp, "branch"),
    department: param(sp, "department"),
    warranty: enumParam(sp, "warranty", WARRANTY_FILTERS),
    archived: param(sp, "archived") === "1",
  };
}
type Filters = ReturnType<typeof assetFilters>;

export function assetWhere(f: Omit<Filters, "page" | "pageSize" | "skip" | "sort" | "dir">): Prisma.AssetWhereInput {
  const today = todayUtc();
  const warranty: Prisma.AssetWhereInput | undefined = !f.warranty
    ? undefined
    : f.warranty === "expired"
      ? { warrantyExpiry: { lt: today } }
      : { warrantyExpiry: { gte: today, lte: new Date(today.getTime() + Number(f.warranty) * 86_400_000) } };

  return {
    deletedAt: f.archived ? { not: null } : null,
    categoryId: f.category,
    status: f.status,
    branchId: f.branch,
    departmentId: f.department,
    ...warranty,
    ...(f.q && {
      OR: [
        { assetCode: { contains: f.q, mode: "insensitive" } },
        { name: { contains: f.q, mode: "insensitive" } },
        { serialNumber: { contains: f.q, mode: "insensitive" } },
        { assetTag: { contains: f.q, mode: "insensitive" } },
        { model: { contains: f.q, mode: "insensitive" } },
        { brand: { contains: f.q, mode: "insensitive" } },
        { category: { name: { contains: f.q, mode: "insensitive" } } },
        // Search by the employee currently holding it.
        {
          assignments: {
            some: {
              status: "ACTIVE",
              employee: {
                OR: [
                  { fullName: { contains: f.q, mode: "insensitive" } },
                  { employeeCode: { contains: f.q, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      ],
    }),
  };
}

function orderBy(sort: Filters["sort"], dir: Filters["dir"]): Prisma.AssetOrderByWithRelationInput[] {
  switch (sort) {
    case "name":
      return [{ name: dir }];
    case "category":
      return [{ category: { name: dir } }, { assetCode: "asc" }];
    case "status":
      return [{ status: dir }, { assetCode: "asc" }];
    case "purchaseDate":
      return [{ purchaseDate: { sort: dir, nulls: "last" } }];
    case "cost":
      return [{ purchaseCost: { sort: dir, nulls: "last" } }];
    case "warranty":
      return [{ warrantyExpiry: { sort: dir, nulls: "last" } }];
    default:
      return [{ assetCode: dir }];
  }
}

export const assetListSelect = {
  id: true,
  assetCode: true,
  name: true,
  brand: true,
  model: true,
  serialNumber: true,
  assetTag: true,
  status: true,
  condition: true,
  purchaseDate: true,
  purchaseCost: true,
  invoiceNumber: true,
  warrantyStart: true,
  warrantyExpiry: true,
  specifications: true,
  description: true,
  deletedAt: true,
  category: { select: { name: true } },
  branch: { select: { name: true } },
  department: { select: { name: true } },
  vendor: { select: { name: true } },
  assignments: {
    where: { status: "ACTIVE" },
    take: 1,
    select: { assignedAt: true, employee: { select: { id: true, fullName: true, employeeCode: true } } },
  },
} satisfies Prisma.AssetSelect;

export async function listAssets(f: Filters) {
  const where = assetWhere(f);
  const [rows, total] = await Promise.all([
    db.asset.findMany({ where, orderBy: orderBy(f.sort, f.dir), skip: f.skip, take: f.pageSize, select: assetListSelect }),
    db.asset.count({ where }),
  ]);
  return { rows, total };
}

export async function getAsset(id: string) {
  return db.asset.findUnique({
    where: { id },
    include: {
      category: true,
      vendor: true,
      branch: true,
      department: true,
      createdBy: { select: { name: true } },
      assignments: {
        orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }],
        include: {
          employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
          assignedBy: { select: { name: true } },
          return: { include: { processedBy: { select: { name: true } } } },
        },
      },
      maintenance: {
        orderBy: { createdAt: "desc" },
        include: { vendor: { select: { name: true } }, assignee: { select: { name: true } } },
      },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });
}

export async function getAssetActivity(id: string) {
  return db.auditLog.findMany({
    where: { entityType: "Asset", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { name: true } } },
  });
}
