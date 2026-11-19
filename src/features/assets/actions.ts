"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { nextCode } from "@/lib/codes";
import { ActionError, fail, ok, runAction, type ActionResult } from "@/lib/action";
import { ASSET_STATUS } from "@/lib/labels";
import { alignCompany } from "./company";
import { assetSchema, type AssetFormValues } from "./schemas";

export async function saveAsset(input: { id?: string | null; values: AssetFormValues }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await authorize(input.id ? "asset:update" : "asset:create");
    const parsed = assetSchema.parse(input.values);

    // The company must sit under the chosen location; with no location picked,
    // the company's HQ is used.
    const company = parsed.companyId
      ? await db.company.findUnique({ where: { id: parsed.companyId }, select: { id: true, name: true, branchId: true, deletedAt: true } })
      : null;
    const aligned = alignCompany(parsed, company);
    if (!aligned.ok) return fail(aligned.error, { companyId: [aligned.error] });
    const data = { ...parsed, branchId: aligned.branchId, companyId: aligned.companyId };

    const saved = await db.$transaction(async (tx) => {
      if (!input.id) {
        if (data.status === "ASSIGNED") {
          throw new ActionError("New assets can't start as Assigned. Create it, then use Assign Asset.");
        }
        if (company?.deletedAt) throw new ActionError(`${company.name} is archived. Restore it in Master Data or pick another company.`);
        const created = await tx.asset.create({
          data: { ...data, specifications: data.specifications ?? undefined, assetCode: await nextCode(tx, "asset"), createdById: actor.id },
        });
        await writeAudit(
          { actorId: actor.id, action: "asset.create", entityType: "Asset", entityId: created.id, summary: `Added ${created.assetCode} ${created.name}`, after: created },
          tx,
        );
        return created;
      }

      const before = await tx.asset.findUnique({ where: { id: input.id } });
      if (!before || before.deletedAt) throw new ActionError("This asset no longer exists or is archived.");
      // An archived company may stay on assets that already use it, but not be newly picked.
      if (company?.deletedAt && before.companyId !== company.id) {
        throw new ActionError(`${company.name} is archived. Restore it in Master Data or pick another company.`);
      }

      // Status moves into and out of ASSIGNED only through assignment and return.
      if (data.status !== before.status) {
        if (before.status === "ASSIGNED") {
          throw new ActionError("This asset is assigned to an employee. Process a return to change its status.");
        }
        if (data.status === "ASSIGNED") {
          throw new ActionError("Use Assign Asset to give this asset to an employee.");
        }
      }

      const after = await tx.asset.update({
        where: { id: input.id },
        data: { ...data, specifications: data.specifications ?? undefined },
      });
      const statusChanged = before.status !== after.status;
      await writeAudit(
        {
          actorId: actor.id,
          action: statusChanged ? "asset.status_change" : "asset.update",
          entityType: "Asset",
          entityId: after.id,
          summary: statusChanged
            ? `Status changed from ${ASSET_STATUS[before.status].label} to ${ASSET_STATUS[after.status].label}`
            : `Updated ${after.assetCode}`,
          before,
          after,
        },
        tx,
      );
      return after;
    });

    refresh();
    return ok({ id: saved.id }, input.id ? "Asset updated" : `Asset ${saved.assetCode} added`);
  });
}

export async function setAssetArchived(input: { id: string; archived: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("asset:delete");

    await db.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({
        where: { id: input.id },
        select: { assetCode: true, status: true, deletedAt: true, _count: { select: { maintenance: { where: { status: { in: ["OPEN", "IN_PROGRESS", "PENDING_PARTS"] } } } } } },
      });
      if (!asset) throw new ActionError("This asset no longer exists.");
      if (input.archived) {
        if (asset.status === "ASSIGNED") throw new ActionError("Return this asset before deleting it.");
        if (asset._count.maintenance > 0) throw new ActionError("Close the open maintenance tickets for this asset first.");
      }
      await tx.asset.update({ where: { id: input.id }, data: { deletedAt: input.archived ? new Date() : null } });
      await writeAudit(
        {
          actorId: actor.id,
          action: input.archived ? "asset.archive" : "asset.restore",
          entityType: "Asset",
          entityId: input.id,
          summary: `${input.archived ? "Deleted" : "Restored"} ${asset.assetCode}`,
        },
        tx,
      );
    });

    refresh();
    return ok(undefined, input.archived ? "Asset deleted. It can be restored from the archive." : "Asset restored");
  });
}
