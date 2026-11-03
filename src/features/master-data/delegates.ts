import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { MasterEntity } from "./config";

type Tx = Prisma.TransactionClient;

// A narrow, uniform view over the five master-data models so one set of actions
// and queries can serve them all. Each model has id, deletedAt and timestamps.
type Row = { id: string; deletedAt: Date | null } & Record<string, unknown>;
type Delegate = {
  findMany(args: object): Promise<Row[]>;
  findUnique(args: object): Promise<Row | null>;
  create(args: object): Promise<Row>;
  update(args: object): Promise<Row>;
};

export function delegate(entity: MasterEntity, client: Tx = db): Delegate {
  const map = {
    categories: client.assetCategory,
    departments: client.department,
    designations: client.designation,
    branches: client.branch,
    vendors: client.vendor,
  } as const;
  return map[entity] as unknown as Delegate;
}

export const ENTITY_TYPE: Record<MasterEntity, string> = {
  categories: "AssetCategory",
  departments: "Department",
  designations: "Designation",
  branches: "Branch",
  vendors: "Vendor",
};

/** Relation counts shown as "Used by" and checked before archiving. */
export const USAGE_COUNTS: Record<MasterEntity, Record<string, boolean | object>> = {
  categories: { assets: { where: { deletedAt: null } } },
  departments: { employees: { where: { deletedAt: null } }, assets: { where: { deletedAt: null } } },
  designations: { employees: { where: { deletedAt: null } } },
  branches: { employees: { where: { deletedAt: null } }, assets: { where: { deletedAt: null } } },
  vendors: { assets: { where: { deletedAt: null } } },
};
