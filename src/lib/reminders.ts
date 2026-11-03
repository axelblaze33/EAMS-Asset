import "server-only";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { todayUtc } from "@/lib/dates";
import { notifyUsers, usersWithPermission } from "@/lib/notify";

const DAY = 86_400_000;

/**
 * Daily reminder sweep (Vercel Cron, or "Run now" in the app). Every reminder
 * carries a dedupe key, so re-running the sweep never notifies twice.
 */
export async function runDailyChecks() {
  const today = todayUtc();
  const counts = { warranty: 0, dueSoon: 0, overdue: 0, unacknowledged: 0, clearance: 0, staleRepairs: 0 };

  await db.$transaction(
    async (tx) => {
      const [itTeam, returnTeam, handoverTeam, clearanceTeam, maintenanceTeam] = await Promise.all([
        usersWithPermission(tx, "asset:update"),
        usersWithPermission(tx, "assignment:return"),
        usersWithPermission(tx, "assignment:create"),
        usersWithPermission(tx, "clearance:manage"),
        usersWithPermission(tx, "maintenance:manage"),
      ]);

      const warranties = await tx.asset.findMany({
        where: { deletedAt: null, status: { notIn: ["RETIRED", "DISPOSED", "LOST"] }, warrantyExpiry: { gte: today, lte: new Date(today.getTime() + 30 * DAY) } },
        select: { id: true, assetCode: true, name: true, warrantyExpiry: true },
      });
      for (const a of warranties) {
        await notifyUsers(tx, itTeam, {
          type: "WARRANTY_EXPIRY",
          title: `Warranty ending: ${a.assetCode}`,
          message: `${a.name}: warranty ends ${format(a.warrantyExpiry!, "d MMM yyyy")}.`,
          link: `/assets/${a.id}`,
          dedupeKey: `warranty30:${a.id}:${a.warrantyExpiry!.toISOString().slice(0, 10)}`,
        });
      }
      counts.warranty = warranties.length;

      const active = await tx.assetAssignment.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          assignedAt: true,
          expectedReturnAt: true,
          acknowledgement: true,
          asset: { select: { id: true, assetCode: true } },
          employee: { select: { fullName: true } },
        },
      });
      for (const a of active) {
        const label = `${a.asset.assetCode} with ${a.employee.fullName}`;
        if (a.expectedReturnAt && a.expectedReturnAt < today) {
          counts.overdue++;
          await notifyUsers(tx, returnTeam, {
            type: "RETURN_OVERDUE",
            title: `Return overdue: ${a.asset.assetCode}`,
            message: `${label} was due back ${format(a.expectedReturnAt, "d MMM yyyy")}.`,
            link: `/assignments/${a.id}/return`,
            dedupeKey: `overdue:${a.id}`,
          });
        } else if (a.expectedReturnAt && a.expectedReturnAt.getTime() - today.getTime() <= 3 * DAY) {
          counts.dueSoon++;
          await notifyUsers(tx, returnTeam, {
            type: "RETURN_REMINDER",
            title: `Return due soon: ${a.asset.assetCode}`,
            message: `${label} is due back ${format(a.expectedReturnAt, "d MMM yyyy")}.`,
            link: `/assets/${a.asset.id}`,
            dedupeKey: `due3:${a.id}`,
          });
        }
        if (a.acknowledgement === "PENDING" && today.getTime() - a.assignedAt.getTime() >= 7 * DAY) {
          counts.unacknowledged++;
          await notifyUsers(tx, handoverTeam, {
            type: "SYSTEM",
            title: `Handover not acknowledged: ${a.asset.assetCode}`,
            message: `${label} since ${format(a.assignedAt, "d MMM yyyy")}. Get the form signed and record it.`,
            link: "/assignments?view=pending",
            dedupeKey: `unack7:${a.id}`,
          });
        }
      }

      const clearances = await tx.employeeExitClearance.findMany({
        where: { status: { in: ["INITIATED", "IN_PROGRESS"] }, lastWorkingDay: { lte: new Date(today.getTime() + 3 * DAY) }, items: { some: { resolution: "PENDING" } } },
        select: { id: true, lastWorkingDay: true, employee: { select: { fullName: true } }, _count: { select: { items: { where: { resolution: "PENDING" } } } } },
      });
      for (const c of clearances) {
        await notifyUsers(tx, clearanceTeam, {
          type: "EXIT_CLEARANCE",
          title: `Exit clearance due: ${c.employee.fullName}`,
          message: `${c._count.items} asset(s) still to collect; last working day ${format(c.lastWorkingDay, "d MMM yyyy")}.`,
          link: `/clearance/${c.id}`,
          dedupeKey: `clearance3:${c.id}`,
        });
      }
      counts.clearance = clearances.length;

      const stale = await tx.maintenanceRequest.findMany({
        where: { status: { in: ["OPEN", "IN_PROGRESS", "PENDING_PARTS"] }, createdAt: { lt: new Date(Date.now() - 14 * DAY) } },
        select: { id: true, ticketCode: true, assigneeId: true, issue: true, asset: { select: { assetCode: true } } },
      });
      for (const t of stale) {
        await notifyUsers(tx, t.assigneeId ? [t.assigneeId] : maintenanceTeam, {
          type: "MAINTENANCE_UPDATE",
          title: `${t.ticketCode} open over 14 days`,
          message: `${t.asset.assetCode}: ${t.issue.slice(0, 100)}`,
          link: `/maintenance/${t.id}`,
          dedupeKey: `stale14:${t.id}`,
        });
      }
      counts.staleRepairs = stale.length;
    },
    { timeout: 120_000 },
  );

  return counts;
}
