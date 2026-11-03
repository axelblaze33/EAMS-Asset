"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { nextCode } from "@/lib/codes";
import { todayUtc } from "@/lib/dates";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";
import { ACKNOWLEDGEMENT_METHOD, ASSET_STATUS } from "@/lib/labels";
import { UPLOAD_LIMITS, verifyStagedFiles } from "@/lib/storage";
import { acknowledgementSchema, assignSchema, returnSchema, type AssignInput, type ReturnInput } from "./schemas";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;

/**
 * Assigns one or more assets to an employee in a single transaction. Each asset
 * flips AVAILABLE → ASSIGNED with a conditional update, so if anything else took
 * it first (or it isn't available) the whole handover rolls back. The partial
 * unique index on active assignments is the database-level backstop.
 */
export async function createAssignments(input: AssignInput): Promise<ActionResult<{ ref: string }>> {
  return runAction(async () => {
    const actor = await authorize("assignment:create");
    const data = assignSchema.parse(input);
    if (data.assignedAt > todayUtc()) throw new ActionError("The assignment date can't be in the future.");
    await verifyStagedFiles(actor.id, data.documents);

    const batchId = randomUUID();
    await db.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: data.employeeId, deletedAt: null },
        select: { id: true, fullName: true, employmentStatus: true, clearances: { where: { status: { in: ["INITIATED", "IN_PROGRESS"] } }, select: { id: true } } },
      });
      if (!employee) throw new ActionError("That employee no longer exists.");
      if (employee.employmentStatus === "EXITED") throw new ActionError(`${employee.fullName} has exited the company.`);
      if (employee.clearances.length) throw new ActionError(`${employee.fullName} has an exit clearance in progress.`);

      if (data.requestId) {
        const request = await tx.assetRequest.findUnique({ where: { id: data.requestId }, select: { employeeId: true, status: true } });
        if (!request || request.employeeId !== employee.id || request.status !== "APPROVED") {
          throw new ActionError("The linked request isn't approved for this employee.");
        }
      }

      const assets = await tx.asset.findMany({
        where: { id: { in: data.items.map((i) => i.assetId) } },
        select: { id: true, assetCode: true, name: true },
      });
      const byId = new Map(assets.map((a) => [a.id, a]));

      for (const [index, item] of data.items.entries()) {
        const asset = byId.get(item.assetId);
        if (!asset) throw new ActionError("One of the selected assets no longer exists.");
        const claimed = await tx.asset.updateMany({
          where: { id: asset.id, status: "AVAILABLE", deletedAt: null },
          data: { status: "ASSIGNED", condition: item.condition },
        });
        if (claimed.count !== 1) throw new ActionError(`${asset.assetCode} is no longer available. Refresh and choose another asset.`);

        const assignment = await tx.assetAssignment.create({
          data: {
            assetId: asset.id,
            employeeId: employee.id,
            batchId,
            assignedAt: data.assignedAt,
            expectedReturnAt: data.expectedReturnAt,
            conditionAtHandover: item.condition,
            accessories: [...new Set(item.accessories)],
            remarks: data.remarks,
            assignedById: actor.id,
            // A request is fulfilled by the first asset of the handover.
            requestId: index === 0 ? (data.requestId ?? null) : null,
          },
        });
        await writeAudit(
          { actorId: actor.id, action: "assignment.create", entityType: "Asset", entityId: asset.id, summary: `Assigned ${asset.assetCode} to ${employee.fullName}`, after: assignment },
          tx,
        );
      }

      if (data.requestId) {
        await tx.assetRequest.update({ where: { id: data.requestId }, data: { status: "FULFILLED" } });
      }

      if (data.documents.length) {
        const first = await tx.assetAssignment.findFirst({ where: { batchId }, select: { id: true } });
        await tx.assetDocument.createMany({
          data: data.documents.map((d) => ({
            type: "HANDOVER" as const,
            fileName: d.fileName,
            storagePath: d.path,
            mimeType: d.mimeType,
            sizeBytes: d.size,
            assignmentId: first!.id,
            uploadedById: actor.id,
          })),
        });
      }
    }, TX);

    refresh();
    return ok({ ref: batchId }, data.items.length === 1 ? "Asset assigned" : `${data.items.length} assets assigned`);
  });
}

/** Closes an active assignment and moves the asset to the chosen next status. */
export async function processReturn(input: ReturnInput): Promise<ActionResult<{ assetId: string }>> {
  return runAction(async () => {
    const actor = await authorize("assignment:return");
    const data = returnSchema.parse(input);
    if (data.returnedAt > todayUtc()) throw new ActionError("The return date can't be in the future.");
    await verifyStagedFiles(actor.id, data.photos, UPLOAD_LIMITS.document);

    const assetId = await db.$transaction(async (tx) => {
      const assignment = await tx.assetAssignment.findUnique({
        where: { id: data.assignmentId },
        select: {
          id: true,
          status: true,
          assignedAt: true,
          accessories: true,
          employee: { select: { id: true, fullName: true } },
          asset: { select: { id: true, assetCode: true, name: true } },
        },
      });
      if (!assignment) throw new ActionError("This assignment no longer exists.");
      if (data.returnedAt < assignment.assignedAt) throw new ActionError("The return date can't be before the assignment date.");
      const missing = data.missingAccessories.filter((a) => assignment.accessories.includes(a));

      const closed = await tx.assetAssignment.updateMany({ where: { id: assignment.id, status: "ACTIVE" }, data: { status: "RETURNED" } });
      if (closed.count !== 1) throw new ActionError("This asset has already been returned.");

      const ret = await tx.assetReturn.create({
        data: {
          assignmentId: assignment.id,
          returnedAt: data.returnedAt,
          conditionAtReturn: data.condition,
          missingAccessories: missing,
          damageNotes: data.damageNotes,
          deductionAmount: data.deductionAmount,
          deductionNotes: data.deductionNotes,
          remarks: data.remarks,
          nextStatus: data.nextStatus,
          processedById: actor.id,
        },
      });
      await tx.asset.update({
        where: { id: assignment.asset.id },
        data: { status: data.nextStatus, condition: data.condition },
      });

      // Returned during an exit clearance: tick the asset off the clearance.
      const clearanceItem = await tx.clearanceItem.findFirst({
        where: { assetId: assignment.asset.id, resolution: "PENDING", clearance: { employeeId: assignment.employee.id, status: { in: ["INITIATED", "IN_PROGRESS"] } } },
        select: { id: true, clearanceId: true },
      });
      if (clearanceItem) {
        const damaged = data.condition === "DAMAGED" || data.condition === "POOR" || !!data.damageNotes;
        await tx.clearanceItem.update({
          where: { id: clearanceItem.id },
          data: {
            resolution: damaged ? "DAMAGED" : "RETURNED",
            recoveryAmount: data.deductionAmount,
            notes: [damaged ? data.damageNotes : null, missing.length ? `Missing: ${missing.join(", ")}` : null].filter(Boolean).join("; ") || null,
            resolvedAt: new Date(),
          },
        });
        await tx.employeeExitClearance.update({ where: { id: clearanceItem.clearanceId }, data: { status: "IN_PROGRESS" } });
      }

      if (data.photos.length) {
        await tx.assetDocument.createMany({
          data: data.photos.map((p) => ({
            type: "RETURN_PHOTO" as const,
            fileName: p.fileName,
            storagePath: p.path,
            mimeType: p.mimeType,
            sizeBytes: p.size,
            returnId: ret.id,
            assetId: assignment.asset.id,
            uploadedById: actor.id,
          })),
        });
      }

      // Sending it to maintenance opens a repair ticket straight away.
      if (data.nextStatus === "UNDER_MAINTENANCE") {
        await tx.maintenanceRequest.create({
          data: {
            ticketCode: await nextCode(tx, "maintenance"),
            assetId: assignment.asset.id,
            issue: data.damageNotes ?? `Inspection after return from ${assignment.employee.fullName}`,
            priority: data.condition === "DAMAGED" || data.condition === "POOR" ? "HIGH" : "MEDIUM",
            reportedById: actor.id,
            previousStatus: "AVAILABLE",
          },
        });
      }

      await writeAudit(
        {
          actorId: actor.id,
          action: "assignment.return",
          entityType: "Asset",
          entityId: assignment.asset.id,
          summary: `${assignment.asset.assetCode} returned by ${assignment.employee.fullName} → ${ASSET_STATUS[data.nextStatus].label}`,
          after: ret,
        },
        tx,
      );
      return assignment.asset.id;
    }, TX);

    refresh();
    return ok({ assetId }, "Return recorded");
  });
}

/**
 * Staff record that the employee confirmed receipt (signed the handover form,
 * replied to an email, or confirmed in person). Employees don't use the app.
 */
export async function recordAcknowledgement(input: z.input<typeof acknowledgementSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("assignment:create");
    const data = acknowledgementSchema.parse(input);
    if (data.acknowledgedOn > todayUtc()) throw new ActionError("The acknowledgement date can't be in the future.");

    await db.$transaction(async (tx) => {
      const rows = await tx.assetAssignment.findMany({
        where: { id: { in: data.assignmentIds }, status: "ACTIVE", acknowledgement: "PENDING" },
        select: { id: true, assignedAt: true, employee: { select: { fullName: true } }, asset: { select: { id: true, assetCode: true } } },
      });
      if (rows.length !== data.assignmentIds.length) throw new ActionError("Some of these assets were already acknowledged or returned. Refresh and try again.");
      if (rows.some((r) => data.acknowledgedOn < r.assignedAt)) throw new ActionError("The acknowledgement date can't be before the handover date.");

      await tx.assetAssignment.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: {
          acknowledgement: "ACKNOWLEDGED",
          acknowledgedAt: data.acknowledgedOn,
          acknowledgementMethod: data.method,
          acknowledgementNote: data.note,
          acknowledgedById: actor.id,
        },
      });
      for (const r of rows) {
        await writeAudit(
          {
            actorId: actor.id,
            action: "assignment.acknowledge",
            entityType: "Asset",
            entityId: r.asset.id,
            summary: `${r.employee.fullName} acknowledged receipt of ${r.asset.assetCode} (${ACKNOWLEDGEMENT_METHOD[data.method].label.toLowerCase()})`,
          },
          tx,
        );
      }
    });

    refresh();
    return ok(undefined, data.assignmentIds.length === 1 ? "Acknowledgement recorded" : `${data.assignmentIds.length} acknowledgements recorded`);
  });
}

/** Attaches a signed paper copy (or other handover files) after the fact. */
export async function attachHandoverDocuments(input: { assignmentId: string; documents: { path: string; fileName: string; mimeType: string; size: number }[] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("assignment:create");
    if (!input.documents.length) throw new ActionError("Choose at least one file.");
    await verifyStagedFiles(actor.id, input.documents);
    const assignment = await db.assetAssignment.findUnique({ where: { id: input.assignmentId }, select: { id: true, assetId: true } });
    if (!assignment) throw new ActionError("This assignment no longer exists.");

    await db.$transaction(async (tx) => {
      await tx.assetDocument.createMany({
        data: input.documents.map((d) => ({
          type: "HANDOVER" as const,
          fileName: d.fileName,
          storagePath: d.path,
          mimeType: d.mimeType,
          sizeBytes: d.size,
          assignmentId: assignment.id,
          uploadedById: actor.id,
        })),
      });
      await writeAudit(
        { actorId: actor.id, action: "assignment.document_add", entityType: "Asset", entityId: assignment.assetId, summary: `Attached ${input.documents.length} handover file(s)` },
        tx,
      );
    });

    refresh();
    return ok(undefined, "Handover files attached");
  });
}
