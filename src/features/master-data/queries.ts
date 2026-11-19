import "server-only";
import { db } from "@/lib/db";
import { displayField, type MasterEntity } from "./config";
import { LIST_INCLUDE, USAGE_COUNTS, delegate } from "./delegates";

export type MasterRow = Record<string, unknown> & {
  id: string;
  deletedAt: Date | null;
  usage: number;
};

export async function listMaster(entity: MasterEntity): Promise<MasterRow[]> {
  const rows = (await delegate(entity).findMany({
    orderBy: [{ deletedAt: { sort: "desc", nulls: "first" } }, { [displayField(entity)]: "asc" }],
    include: { ...LIST_INCLUDE[entity], _count: { select: USAGE_COUNTS[entity] } },
  })) as (Record<string, unknown> & { id: string; deletedAt: Date | null; _count: Record<string, number>; branch?: { name: string } })[];

  return rows.map(({ _count, branch, ...row }) => ({
    ...row,
    ...(branch && { branchName: branch.name }),
    // Decimals don't cross the server/client boundary; send plain numbers.
    ...("salvagePercent" in row ? { salvagePercent: Number(row.salvagePercent) } : {}),
    usage: Object.values(_count).reduce((a, b) => a + b, 0),
  }));
}

// ─── Options for pickers and filters (active records only) ───────────────────

export async function getOrgOptions() {
  const [categories, departments, designations, branches, companies, vendors] = await Promise.all([
    db.assetCategory.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.designation.findMany({ where: { deletedAt: null }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.branch.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.company.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
    }),
    db.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const opt = (rows: { id: string; name?: string; title?: string }[]) =>
    rows.map((r) => ({ value: r.id, label: (r.name ?? r.title)! }));
  return {
    categories: opt(categories),
    departments: opt(departments),
    designations: opt(designations),
    branches: opt(branches),
    companies: companies.map((c) => ({ value: c.id, label: c.name, branchId: c.branchId, branchName: c.branch.name })),
    vendors: opt(vendors),
  };
}
export type OrgOptions = Awaited<ReturnType<typeof getOrgOptions>>;
