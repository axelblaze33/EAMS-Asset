"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";
import { isSecretBoxConfigured, open, seal } from "@/lib/secret-box";

// Passwords never go into audit snapshots, logs or error messages; audit rows
// only say who did what to which entry.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

const saveSchema = z.object({
  assetId: z.string().min(1),
  id: z.string().optional().nullable(),
  label: z.string().trim().min(1, "Give it a name, e.g. Windows login").max(60),
  username: optionalText(120),
  // Left blank when editing = keep the current password.
  password: z.string().max(200).optional().default(""),
  notes: optionalText(500),
  reason: optionalText(200),
});

function requireKey() {
  if (!isSecretBoxConfigured()) {
    throw new ActionError("Password storage is off: set CREDENTIALS_ENCRYPTION_KEY (openssl rand -base64 32) and redeploy.");
  }
}

export async function saveCredential(input: z.input<typeof saveSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await authorize("credential:manage");
    requireKey();
    const data = saveSchema.parse(input);
    if (!data.id && !data.password) throw new ActionError("Enter the password.");

    const saved = await db.$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({ where: { id: data.assetId, deletedAt: null }, select: { id: true, assetCode: true } });
      if (!asset) throw new ActionError("This asset no longer exists.");

      if (!data.id) {
        const secret = seal(data.password);
        const created = await tx.assetCredential.create({
          data: { assetId: asset.id, label: data.label, username: data.username, notes: data.notes, secret, createdById: actor.id, updatedById: actor.id },
        });
        await tx.assetCredentialHistory.create({
          data: { credentialId: created.id, event: "CREATED", username: data.username, secret, reason: data.reason, changedById: actor.id },
        });
        await writeAudit({ actorId: actor.id, action: "credential.create", entityType: "Asset", entityId: asset.id, summary: `Saved "${data.label}" password for ${asset.assetCode}` }, tx);
        return created;
      }

      const current = await tx.assetCredential.findFirst({ where: { id: data.id, assetId: asset.id, deletedAt: null } });
      if (!current) throw new ActionError("This password entry no longer exists.");
      const passwordChanged = !!data.password && open(current.secret) !== data.password;
      const secret = passwordChanged ? seal(data.password) : current.secret;
      const updated = await tx.assetCredential.update({
        where: { id: current.id },
        data: { label: data.label, username: data.username, notes: data.notes, secret, updatedById: actor.id },
      });
      if (passwordChanged || current.username !== data.username) {
        await tx.assetCredentialHistory.create({
          data: { credentialId: current.id, event: "UPDATED", username: data.username, secret, reason: data.reason, changedById: actor.id },
        });
      }
      await writeAudit(
        {
          actorId: actor.id,
          action: passwordChanged ? "credential.change" : "credential.update",
          entityType: "Asset",
          entityId: asset.id,
          summary: `${passwordChanged ? "Changed" : "Edited"} "${data.label}" password for ${asset.assetCode}${data.reason ? ` (${data.reason})` : ""}`,
        },
        tx,
      );
      return updated;
    });

    refresh();
    return ok({ id: saved.id }, data.id ? "Password entry updated" : "Password saved");
  });
}

export async function deleteCredential(input: { id: string; reason?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("credential:manage");
    const reason = (input.reason ?? "").trim().slice(0, 200) || null;

    await db.$transaction(async (tx) => {
      const c = await tx.assetCredential.findFirst({ where: { id: input.id, deletedAt: null }, include: { asset: { select: { id: true, assetCode: true } } } });
      if (!c) throw new ActionError("This password entry no longer exists.");
      // Soft delete: the history (and the old values) stay available to auditors.
      await tx.assetCredential.update({ where: { id: c.id }, data: { deletedAt: new Date(), updatedById: actor.id } });
      await tx.assetCredentialHistory.create({ data: { credentialId: c.id, event: "DELETED", username: c.username, reason, changedById: actor.id } });
      await writeAudit(
        { actorId: actor.id, action: "credential.delete", entityType: "Asset", entityId: c.asset.id, summary: `Removed "${c.label}" password from ${c.asset.assetCode}${reason ? ` (${reason})` : ""}` },
        tx,
      );
    });

    refresh();
    return ok(undefined, "Password entry removed");
  });
}

/** Decrypts the current value (or a historical one) for display. Always audited. */
export async function revealCredential(input: { id: string; historyId?: string }): Promise<ActionResult<{ password: string }>> {
  return runAction(async () => {
    const actor = await authorize("credential:read");
    requireKey();

    const c = await db.assetCredential.findUnique({ where: { id: input.id }, include: { asset: { select: { id: true, assetCode: true } } } });
    if (!c) throw new ActionError("This password entry no longer exists.");
    let sealed = c.secret;
    let which = "current";
    if (input.historyId) {
      const h = await db.assetCredentialHistory.findFirst({ where: { id: input.historyId, credentialId: c.id }, select: { secret: true, changedAt: true } });
      if (!h?.secret) throw new ActionError("That version has no stored password.");
      sealed = h.secret;
      which = `version from ${h.changedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
    } else if (c.deletedAt) {
      throw new ActionError("This password entry was removed.");
    }

    let password: string;
    try {
      password = open(sealed);
    } catch {
      throw new ActionError("This password can't be decrypted. Was CREDENTIALS_ENCRYPTION_KEY changed?");
    }
    await writeAudit({
      actorId: actor.id,
      action: "credential.reveal",
      entityType: "Asset",
      entityId: c.asset.id,
      summary: `Viewed "${c.label}" password (${which}) for ${c.asset.assetCode}`,
    });
    return ok({ password });
  });
}
