import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { enumParam, param, parseList, type SearchParams } from "@/lib/list-params";
import { OPEN_STATUSES, PRIORITIES } from "./schemas";

export const TICKET_VIEWS = ["open", "completed", "cancelled", "all"] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];

export function ticketFilters(sp: SearchParams) {
  return {
    ...parseList(sp, { sortable: ["createdAt", "priority", "cost"] as const, defaultSort: "createdAt", defaultDir: "desc" }),
    view: enumParam(sp, "view", TICKET_VIEWS) ?? "open",
    priority: enumParam(sp, "priority", PRIORITIES),
    vendor: param(sp, "vendor"),
    assignee: param(sp, "assignee"),
  };
}
type Filters = ReturnType<typeof ticketFilters>;

export function ticketWhere(f: Pick<Filters, "view" | "priority" | "vendor" | "assignee" | "q">): Prisma.MaintenanceRequestWhereInput {
  return {
    status:
      f.view === "open" ? { in: [...OPEN_STATUSES] } : f.view === "completed" ? "COMPLETED" : f.view === "cancelled" ? "CANCELLED" : undefined,
    priority: f.priority,
    vendorId: f.vendor,
    assigneeId: f.assignee,
    ...(f.q && {
      OR: [
        { ticketCode: { contains: f.q, mode: "insensitive" } },
        { issue: { contains: f.q, mode: "insensitive" } },
        { asset: { assetCode: { contains: f.q, mode: "insensitive" } } },
        { asset: { name: { contains: f.q, mode: "insensitive" } } },
        { asset: { serialNumber: { contains: f.q, mode: "insensitive" } } },
      ],
    }),
  };
}

export async function listTickets(f: Filters) {
  const where = ticketWhere(f);
  const orderBy: Prisma.MaintenanceRequestOrderByWithRelationInput[] =
    f.sort === "priority" ? [{ priority: f.dir }, { createdAt: "desc" }] : f.sort === "cost" ? [{ cost: { sort: f.dir, nulls: "last" } }] : [{ createdAt: f.dir }];
  const [rows, total, counts] = await Promise.all([
    db.maintenanceRequest.findMany({
      where,
      orderBy,
      skip: f.skip,
      take: f.pageSize,
      include: {
        asset: { select: { id: true, assetCode: true, name: true, category: { select: { name: true } } } },
        vendor: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
    db.maintenanceRequest.count({ where }),
    Promise.all(TICKET_VIEWS.map((view) => db.maintenanceRequest.count({ where: ticketWhere({ ...f, view }) }))),
  ]);
  return { rows, total, counts: Object.fromEntries(TICKET_VIEWS.map((v, i) => [v, counts[i]!])) as Record<TicketView, number> };
}

export async function getTicket(id: string) {
  return db.maintenanceRequest.findUnique({
    where: { id },
    include: {
      asset: {
        select: {
          id: true,
          assetCode: true,
          name: true,
          serialNumber: true,
          status: true,
          warrantyExpiry: true,
          vendor: { select: { name: true } },
          category: { select: { name: true } },
          assignments: { where: { status: "ACTIVE" }, select: { employee: { select: { id: true, fullName: true } } } },
        },
      },
      vendor: true,
      assignee: { select: { id: true, name: true } },
      reportedBy: { select: { name: true } },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, createdAt: true } },
    },
  });
}

export async function getTicketOptions() {
  const [assets, assignees, vendors] = await Promise.all([
    db.asset.findMany({
      where: { deletedAt: null, status: { notIn: ["LOST", "DISPOSED"] } },
      orderBy: { assetCode: "asc" },
      select: { id: true, assetCode: true, name: true, status: true, serialNumber: true },
    }),
    db.user.findMany({
      where: { isActive: true, role: { permissions: { some: { permission: { key: "maintenance:manage" } } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    assets,
    assignees: assignees.map((u) => ({ value: u.id, label: u.name })),
    vendors: vendors.map((v) => ({ value: v.id, label: v.name })),
  };
}
export type TicketOptions = Awaited<ReturnType<typeof getTicketOptions>>;
