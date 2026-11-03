"use server";

import { refresh } from "next/cache";
import { Prisma, type AssetStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { nextCode } from "@/lib/codes";
import { todayUtc } from "@/lib/dates";
import { notifyUsers } from "@/lib/notify";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";
import { ASSET_STATUS, MAINTENANCE_STATUS } from "@/lib/labels";
import { verifyStagedFiles } from "@/lib/storage";
import { OPEN_STATUSES, createTicketSchema, updateTicketSchema, type CreateTicketInput, type UpdateTicketInput } from "./schemas";

type Tx = Prisma.TransactionClient;
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const UNSERVICEABLE: AssetStatus[] = ["LOST", "DISPOSED"];

async function attachDocs(tx: Tx, maintenanceId: string, assetId: string, actorId: string, docs: { path: string; fileName: string; mimeType: string; size: number }[]) {
  if (!docs.length) return;
  await tx.assetDocument.createMany({
    data: docs.map((d) => ({
      type: "MAINTENANCE_INVOICE" as const,
      fileName: d.fileName,
      storagePath: d.path,
      mimeType: d.mimeType,
      sizeBytes: d.size,
      maintenanceId,
      assetId,
      uploadedById: actorId,
    })),
  });
}

async function assertAssignee(tx: Tx, assigneeId: string | null) {
  if (!assigneeId) return;
  const ok = await tx.user.count({
    where: { id: assigneeId, isActive: true, role: { permissions: { some: { permission: { key: "maintenance:manage" } } } } },
  });
  if (!ok) throw new ActionError("The selected assignee can't manage maintenance.");
}

export async function createTicket(input: CreateTicketInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await authorize("maintenance:manage");
    const data = createTicketSchema.parse(input);
    if (data.startedAt && data.startedAt > todayUtc()) throw new ActionError("The start date can't be in the future.");
    await verifyStagedFiles(actor.id, data.documents);

    const ticket = await db.$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({ where: { id: data.assetId, deletedAt: null }, select: { id: true, assetCode: true, status: true } });
      if (!asset) throw new ActionError("That asset no longer exists.");
      if (UNSERVICEABLE.includes(asset.status)) throw new ActionError(`${asset.assetCode} is ${ASSET_STATUS[asset.status].label.toLowerCase()} and can't be serviced.`);
      await assertAssignee(tx, data.assigneeId);

      // Assigned assets stay with the employee (e.g. on-site repair); others are
      // taken out of service and the current status is remembered for later.
      const moveOut = data.takeOutOfService && asset.status !== "ASSIGNED" && asset.status !== "UNDER_MAINTENANCE";
      const created = await tx.maintenanceRequest.create({
        data: {
          ticketCode: await nextCode(tx, "maintenance"),
          assetId: asset.id,
          issue: data.issue,
          priority: data.priority,
          assigneeId: data.assigneeId,
          vendorId: data.vendorId,
          startedAt: data.startedAt,
          status: data.startedAt ? "IN_PROGRESS" : "OPEN",
          reportedById: actor.id,
          previousStatus: moveOut ? asset.status : asset.status === "UNDER_MAINTENANCE" ? "AVAILABLE" : null,
        },
      });
      if (moveOut) await tx.asset.update({ where: { id: asset.id }, data: { status: "UNDER_MAINTENANCE" } });
      await attachDocs(tx, created.id, asset.id, actor.id, data.documents);
      await writeAudit(
        { actorId: actor.id, action: "maintenance.create", entityType: "Asset", entityId: asset.id, summary: `${created.ticketCode} opened for ${asset.assetCode}: ${data.issue.slice(0, 80)}`, after: created },
        tx,
      );
      if (data.assigneeId && data.assigneeId !== actor.id) {
        await notifyUsers(tx, [data.assigneeId], {
          type: "MAINTENANCE_UPDATE",
          title: `${created.ticketCode} assigned to you`,
          message: `${asset.assetCode}: ${data.issue.slice(0, 120)}`,
          link: `/maintenance/${created.id}`,
        });
      }
      return created;
    }, TX);

    refresh();
    return ok({ id: ticket.id }, `Ticket ${ticket.ticketCode} opened`);
  });
}

export async function updateTicket(input: UpdateTicketInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("maintenance:manage");
    const data = updateTicketSchema.parse(input);
    const today = todayUtc();
    if ((data.startedAt && data.startedAt > today) || (data.completedAt && data.completedAt > today)) {
      throw new ActionError("Dates can't be in the future.");
    }
    await verifyStagedFiles(actor.id, data.documents);

    await db.$transaction(async (tx) => {
      const before = await tx.maintenanceRequest.findUnique({
        where: { id: data.id },
        include: { asset: { select: { id: true, assetCode: true, status: true } } },
      });
      if (!before) throw new ActionError("This ticket no longer exists.");
      if (before.status === "COMPLETED" || before.status === "CANCELLED") {
        throw new ActionError("This ticket is closed. Open a new ticket for further work.");
      }
      await assertAssignee(tx, data.assigneeId);

      const closing = data.status === "COMPLETED" || data.status === "CANCELLED";
      const after = await tx.maintenanceRequest.update({
        where: { id: data.id },
        data: {
          status: data.status,
          priority: data.priority,
          assigneeId: data.assigneeId,
          vendorId: data.vendorId,
          cost: data.cost,
          startedAt: data.startedAt ?? (data.status === "IN_PROGRESS" ? (before.startedAt ?? today) : before.startedAt),
          completedAt: data.status === "COMPLETED" ? data.completedAt : null,
          resolutionNotes: data.resolutionNotes,
        },
      });

      // Bring the asset back once no other repair on it is still open.
      let assetChange = "";
      if (closing && before.asset.status === "UNDER_MAINTENANCE") {
        const others = await tx.maintenanceRequest.count({ where: { assetId: before.asset.id, id: { not: before.id }, status: { in: [...OPEN_STATUSES] } } });
        if (others === 0) {
          const next: AssetStatus = data.status === "COMPLETED" ? data.afterStatus : (before.previousStatus ?? "AVAILABLE");
          await tx.asset.update({ where: { id: before.asset.id }, data: { status: next } });
          assetChange = `; asset → ${ASSET_STATUS[next].label}`;
        }
      }
      await attachDocs(tx, before.id, before.asset.id, actor.id, data.documents);

      const statusText = before.status !== after.status ? `${MAINTENANCE_STATUS[before.status].label} → ${MAINTENANCE_STATUS[after.status].label}` : "updated";
      await writeAudit(
        {
          actorId: actor.id,
          action: closing ? `maintenance.${after.status.toLowerCase()}` : "maintenance.update",
          entityType: "Asset",
          entityId: before.asset.id,
          summary: `${before.ticketCode} ${statusText}${assetChange}`,
          before,
          after,
        },
        tx,
      );
      if (data.assigneeId && data.assigneeId !== before.assigneeId && data.assigneeId !== actor.id) {
        await notifyUsers(tx, [data.assigneeId], {
          type: "MAINTENANCE_UPDATE",
          title: `${before.ticketCode} assigned to you`,
          message: `${before.asset.assetCode}: ${before.issue.slice(0, 120)}`,
          link: `/maintenance/${before.id}`,
        });
      }
    }, TX);

    refresh();
    return ok(undefined, data.status === "COMPLETED" ? "Ticket completed" : data.status === "CANCELLED" ? "Ticket cancelled" : "Ticket updated");
  });
}
