"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize, hasAnyPermission } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { nextCode } from "@/lib/codes";
import { notifyUsers, usersWithPermission } from "@/lib/notify";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";

const createSchema = z.object({
  employeeId: z.string().min(1, "Choose an employee"),
  categoryId: z.string().min(1, "Choose a category"),
  type: z.enum(["NEW_ASSET", "REPLACEMENT"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  reason: z.string().trim().min(5, "Add a short reason").max(1000),
});

export async function createRequest(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await authorize("request:create");
    const data = createSchema.parse(input);

    const request = await db.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({ where: { id: data.employeeId, deletedAt: null }, select: { fullName: true, employmentStatus: true } });
      if (!employee) throw new ActionError("That employee no longer exists.");
      if (employee.employmentStatus === "EXITED") throw new ActionError(`${employee.fullName} has exited the company.`);
      const category = await tx.assetCategory.findFirst({ where: { id: data.categoryId, deletedAt: null }, select: { name: true } });
      if (!category) throw new ActionError("That category no longer exists.");

      const created = await tx.assetRequest.create({
        data: { ...data, requestCode: await nextCode(tx, "request"), requestedById: actor.id },
      });
      await writeAudit(
        { actorId: actor.id, action: "request.create", entityType: "AssetRequest", entityId: created.id, summary: `${created.requestCode}: ${category.name} for ${employee.fullName}`, after: created },
        tx,
      );
      const approvers = (await usersWithPermission(tx, "request:approve")).filter((id) => id !== actor.id);
      await notifyUsers(tx, approvers, {
        type: "REQUEST_PENDING",
        title: `${created.requestCode} needs approval`,
        message: `${category.name} for ${employee.fullName}: ${data.reason.slice(0, 120)}`,
        link: "/requests",
      });
      return created;
    });

    refresh();
    return ok({ id: request.id }, `Request ${request.requestCode} logged`);
  });
}

const reviewSchema = z
  .object({
    id: z.string().min(1),
    decision: z.enum(["APPROVE", "REJECT"]),
    notes: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => v || null),
  })
  .refine((v) => v.decision === "APPROVE" || v.notes, { path: ["notes"], message: "Give a reason for rejecting" });

export async function reviewRequest(input: z.input<typeof reviewSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("request:approve");
    const data = reviewSchema.parse(input);
    const status = data.decision === "APPROVE" ? "APPROVED" : "REJECTED";

    await db.$transaction(async (tx) => {
      const req = await tx.assetRequest.findUnique({
        where: { id: data.id },
        select: { requestCode: true, requestedById: true, employee: { select: { fullName: true } }, category: { select: { name: true } } },
      });
      if (!req) throw new ActionError("This request no longer exists.");
      const updated = await tx.assetRequest.updateMany({
        where: { id: data.id, status: "PENDING" },
        data: { status, reviewedById: actor.id, reviewedAt: new Date(), reviewNotes: data.notes },
      });
      if (updated.count !== 1) throw new ActionError("This request has already been reviewed.");
      await writeAudit(
        { actorId: actor.id, action: `request.${status.toLowerCase()}`, entityType: "AssetRequest", entityId: data.id, summary: `${req.requestCode} ${status.toLowerCase()}${data.notes ? `: ${data.notes}` : ""}` },
        tx,
      );
      if (req.requestedById && req.requestedById !== actor.id) {
        await notifyUsers(tx, [req.requestedById], {
          type: "REQUEST_UPDATED",
          title: `${req.requestCode} ${status === "APPROVED" ? "approved" : "rejected"}`,
          message: `${req.category.name} for ${req.employee.fullName}${data.notes ? `: ${data.notes}` : ""}`,
          link: "/requests",
        });
      }
    });

    refresh();
    return ok(undefined, status === "APPROVED" ? "Request approved. Assign an asset to fulfil it." : "Request rejected");
  });
}

export async function cancelRequest(input: { id: string; notes?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize();
    if (!hasAnyPermission(actor, "request:create", "request:approve")) throw new ActionError("You do not have permission to perform this action.");
    const notes = z.string().trim().max(1000).optional().parse(input.notes) || null;

    await db.$transaction(async (tx) => {
      const req = await tx.assetRequest.findUnique({ where: { id: input.id }, select: { requestCode: true } });
      if (!req) throw new ActionError("This request no longer exists.");
      const updated = await tx.assetRequest.updateMany({
        where: { id: input.id, status: { in: ["PENDING", "APPROVED"] } },
        data: { status: "CANCELLED", reviewNotes: notes, reviewedById: actor.id, reviewedAt: new Date() },
      });
      if (updated.count !== 1) throw new ActionError("Only pending or approved requests can be cancelled.");
      await writeAudit({ actorId: actor.id, action: "request.cancel", entityType: "AssetRequest", entityId: input.id, summary: `${req.requestCode} cancelled${notes ? `: ${notes}` : ""}` }, tx);
    });

    refresh();
    return ok(undefined, "Request cancelled");
  });
}
