"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { requiredDate, todayUtc } from "@/lib/dates";
import { notifyUsers, usersWithPermission } from "@/lib/notify";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const OPEN = ["INITIATED", "IN_PROGRESS"] as const;

const initiateSchema = z.object({
  employeeId: z.string().min(1, "Choose an employee"),
  lastWorkingDay: requiredDate,
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
  cancelOpenRequests: z.boolean().default(true),
});

/** Starts an exit clearance: snapshots every asset the employee holds. */
export async function initiateClearance(input: z.input<typeof initiateSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await authorize("clearance:manage");
    const data = initiateSchema.parse(input);

    const clearance = await db.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: data.employeeId, deletedAt: null },
        select: { id: true, fullName: true, employmentStatus: true, joiningDate: true },
      });
      if (!employee) throw new ActionError("That employee no longer exists.");
      if (employee.employmentStatus === "EXITED") throw new ActionError(`${employee.fullName} has already exited.`);
      if (employee.joiningDate && data.lastWorkingDay < employee.joiningDate) throw new ActionError("The last working day is before the joining date.");
      const open = await tx.employeeExitClearance.count({ where: { employeeId: employee.id, status: { in: [...OPEN] } } });
      if (open) throw new ActionError(`${employee.fullName} already has an exit clearance in progress.`);

      const active = await tx.assetAssignment.findMany({ where: { employeeId: employee.id, status: "ACTIVE" }, select: { assetId: true } });
      // The partial unique index also guarantees one open clearance per employee.
      const created = await tx.employeeExitClearance.create({
        data: {
          employeeId: employee.id,
          lastWorkingDay: data.lastWorkingDay,
          notes: data.notes,
          initiatedById: actor.id,
          items: { create: active.map((a) => ({ assetId: a.assetId })) },
        },
      });
      if (employee.employmentStatus === "ACTIVE" || employee.employmentStatus === "ON_LEAVE") {
        await tx.employee.update({ where: { id: employee.id }, data: { employmentStatus: "ON_NOTICE" } });
      }
      let cancelled = 0;
      if (data.cancelOpenRequests) {
        const r = await tx.assetRequest.updateMany({
          where: { employeeId: employee.id, status: { in: ["PENDING", "APPROVED"] } },
          data: { status: "CANCELLED", reviewNotes: "Employee is leaving (exit clearance started)", reviewedById: actor.id, reviewedAt: new Date() },
        });
        cancelled = r.count;
      }
      await writeAudit(
        {
          actorId: actor.id,
          action: "clearance.initiate",
          entityType: "EmployeeExitClearance",
          entityId: created.id,
          summary: `Exit clearance started for ${employee.fullName} (${active.length} asset(s)${cancelled ? `, ${cancelled} request(s) cancelled` : ""})`,
        },
        tx,
      );
      const team = (await usersWithPermission(tx, "assignment:return")).filter((id) => id !== actor.id);
      await notifyUsers(tx, team, {
        type: "EXIT_CLEARANCE",
        title: `Exit clearance: ${employee.fullName}`,
        message: active.length ? `${active.length} asset(s) to collect before the last working day.` : "No assets to collect.",
        link: `/clearance/${created.id}`,
      });
      return created;
    }, TX);

    refresh();
    return ok({ id: clearance.id }, "Exit clearance started");
  });
}

const resolveSchema = z.object({
  itemId: z.string().min(1),
  resolution: z.enum(["MISSING", "WAIVED"]),
  notes: z.string().trim().min(3, "Add a short note").max(1000),
  recoveryAmount: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 1e8) {
        ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    }),
});

/**
 * Resolves an asset that won't come back through a normal return:
 * MISSING (lost; asset → Lost) or WAIVED (written off / kept with approval; asset → Disposed).
 * The assignment is closed with a return record so the custody trail stays complete.
 */
export async function resolveClearanceItem(input: z.input<typeof resolveSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("clearance:manage");
    const data = resolveSchema.parse(input);

    await db.$transaction(async (tx) => {
      const item = await tx.clearanceItem.findUnique({
        where: { id: data.itemId },
        include: { clearance: { select: { id: true, status: true, employeeId: true } }, asset: { select: { id: true, assetCode: true } } },
      });
      if (!item) throw new ActionError("This item no longer exists.");
      if (!(OPEN as readonly string[]).includes(item.clearance.status)) throw new ActionError("This clearance is closed.");
      if (item.resolution !== "PENDING") throw new ActionError("This asset has already been resolved.");

      const assignment = await tx.assetAssignment.findFirst({
        where: { assetId: item.asset.id, employeeId: item.clearance.employeeId, status: "ACTIVE" },
        select: { id: true, conditionAtHandover: true },
      });
      const nextStatus = data.resolution === "MISSING" ? "LOST" : "DISPOSED";
      if (assignment) {
        const closed = await tx.assetAssignment.updateMany({ where: { id: assignment.id, status: "ACTIVE" }, data: { status: "RETURNED" } });
        if (closed.count !== 1) throw new ActionError("This asset was just returned. Refresh the page.");
        await tx.assetReturn.create({
          data: {
            assignmentId: assignment.id,
            returnedAt: todayUtc(),
            conditionAtReturn: assignment.conditionAtHandover,
            damageNotes: `${data.resolution === "MISSING" ? "Not returned at exit (missing)" : "Written off at exit"}: ${data.notes}`,
            deductionAmount: data.recoveryAmount,
            nextStatus,
            processedById: actor.id,
          },
        });
        await tx.asset.update({ where: { id: item.asset.id }, data: { status: nextStatus } });
      }
      await tx.clearanceItem.update({
        where: { id: item.id },
        data: { resolution: data.resolution, notes: data.notes, recoveryAmount: data.recoveryAmount, resolvedAt: new Date() },
      });
      await tx.employeeExitClearance.update({ where: { id: item.clearance.id }, data: { status: "IN_PROGRESS" } });
      await writeAudit(
        {
          actorId: actor.id,
          action: data.resolution === "MISSING" ? "clearance.item_missing" : "clearance.item_waived",
          entityType: "Asset",
          entityId: item.asset.id,
          summary: `${item.asset.assetCode} ${data.resolution === "MISSING" ? "marked missing" : "written off"} at exit: ${data.notes}`,
        },
        tx,
      );
    }, TX);

    refresh();
    return ok(undefined, data.resolution === "MISSING" ? "Marked as missing" : "Written off");
  });
}

/** Completes the clearance once every asset is resolved; the employee is marked exited. */
export async function completeClearance(input: { id: string; notes?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("clearance:manage");

    await db.$transaction(async (tx) => {
      const c = await tx.employeeExitClearance.findUnique({
        where: { id: input.id },
        include: { items: { select: { resolution: true } }, employee: { select: { id: true, fullName: true } } },
      });
      if (!c) throw new ActionError("This clearance no longer exists.");
      if (!(OPEN as readonly string[]).includes(c.status)) throw new ActionError("This clearance is already closed.");
      const pending = c.items.filter((i) => i.resolution === "PENDING").length;
      if (pending) throw new ActionError(`${pending} asset(s) are still pending. Return, mark missing or write them off first.`);
      const holding = await tx.assetAssignment.count({ where: { employeeId: c.employeeId, status: "ACTIVE" } });
      if (holding) throw new ActionError(`${c.employee.fullName} still holds ${holding} asset(s) that aren't on this clearance. Return them first.`);

      await tx.employeeExitClearance.update({
        where: { id: c.id },
        data: { status: "COMPLETED", completedAt: new Date(), completedById: actor.id, notes: input.notes?.trim() ? input.notes.trim() : c.notes },
      });
      await tx.employee.update({ where: { id: c.employeeId }, data: { employmentStatus: "EXITED", exitDate: c.lastWorkingDay } });
      // Their login (if any) can no longer be used.
      await tx.user.updateMany({ where: { employeeId: c.employeeId, isActive: true }, data: { isActive: false, sessionVersion: { increment: 1 } } });
      await writeAudit(
        { actorId: actor.id, action: "clearance.complete", entityType: "EmployeeExitClearance", entityId: c.id, summary: `Exit clearance completed for ${c.employee.fullName}` },
        tx,
      );
    }, TX);

    refresh();
    return ok(undefined, "Clearance completed. The employee is now marked as exited.");
  });
}

/** E.g. resignation withdrawn: the employee goes back to active. */
export async function cancelClearance(input: { id: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("clearance:manage");
    const reason = (input.reason ?? "").trim().slice(0, 500);
    if (reason.length < 3) throw new ActionError("Give a reason for cancelling the clearance.");

    await db.$transaction(async (tx) => {
      const c = await tx.employeeExitClearance.findUnique({ where: { id: input.id }, include: { employee: { select: { fullName: true, employmentStatus: true } } } });
      if (!c) throw new ActionError("This clearance no longer exists.");
      if (!(OPEN as readonly string[]).includes(c.status)) throw new ActionError("This clearance is already closed.");
      await tx.employeeExitClearance.update({ where: { id: c.id }, data: { status: "CANCELLED", notes: [c.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n") } });
      if (c.employee.employmentStatus === "ON_NOTICE") await tx.employee.update({ where: { id: c.employeeId }, data: { employmentStatus: "ACTIVE" } });
      await writeAudit(
        { actorId: actor.id, action: "clearance.cancel", entityType: "EmployeeExitClearance", entityId: c.id, summary: `Exit clearance for ${c.employee.fullName} cancelled: ${reason}` },
        tx,
      );
    }, TX);

    refresh();
    return ok(undefined, "Clearance cancelled");
  });
}
