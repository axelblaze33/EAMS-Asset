import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { enumParam, parseList, type SearchParams } from "@/lib/list-params";

export const CLEARANCE_VIEWS = ["open", "completed", "cancelled", "all"] as const;
export type ClearanceView = (typeof CLEARANCE_VIEWS)[number];

export function clearanceFilters(sp: SearchParams) {
  return {
    ...parseList(sp, { sortable: ["lastWorkingDay", "createdAt"] as const, defaultSort: "lastWorkingDay", defaultDir: "asc" }),
    view: enumParam(sp, "view", CLEARANCE_VIEWS) ?? "open",
  };
}
type Filters = ReturnType<typeof clearanceFilters>;

const where = (f: Pick<Filters, "view" | "q">): Prisma.EmployeeExitClearanceWhereInput => ({
  status:
    f.view === "open" ? { in: ["INITIATED", "IN_PROGRESS"] } : f.view === "completed" ? "COMPLETED" : f.view === "cancelled" ? "CANCELLED" : undefined,
  ...(f.q && {
    employee: { OR: [{ fullName: { contains: f.q, mode: "insensitive" } }, { employeeCode: { contains: f.q, mode: "insensitive" } }] },
  }),
});

export async function listClearances(f: Filters) {
  const w = where(f);
  const [rows, total, counts] = await Promise.all([
    db.employeeExitClearance.findMany({
      where: w,
      orderBy: f.sort === "createdAt" ? { createdAt: f.dir } : { lastWorkingDay: f.dir },
      skip: f.skip,
      take: f.pageSize,
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
        items: { select: { resolution: true } },
        initiatedBy: { select: { name: true } },
      },
    }),
    db.employeeExitClearance.count({ where: w }),
    Promise.all(CLEARANCE_VIEWS.map((view) => db.employeeExitClearance.count({ where: where({ ...f, view }) }))),
  ]);
  return { rows, total, counts: Object.fromEntries(CLEARANCE_VIEWS.map((v, i) => [v, counts[i]!])) as Record<ClearanceView, number> };
}

export async function getClearance(id: string) {
  return db.employeeExitClearance.findUnique({
    where: { id },
    include: {
      employee: { include: { department: true, designation: true, manager: { select: { fullName: true } } } },
      initiatedBy: { select: { name: true } },
      completedBy: { select: { name: true } },
      items: {
        orderBy: { asset: { assetCode: "asc" } },
        include: {
          asset: {
            select: {
              id: true,
              assetCode: true,
              name: true,
              serialNumber: true,
              status: true,
              purchaseCost: true,
              category: { select: { name: true } },
              assignments: { where: { status: "ACTIVE" }, select: { id: true, accessories: true, employeeId: true } },
            },
          },
        },
      },
    },
  });
}
