"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize, hasAnyPermission } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";
import { UPLOAD_LIMITS, createUploadTarget, removeFiles, signedUrl, verifyUpload } from "@/lib/storage";

const DOC_TYPES = ["ASSET_IMAGE", "INVOICE", "OTHER"] as const;

const fileMeta = z.object({
  assetId: z.string().min(1),
  type: z.enum(DOC_TYPES),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

const allowedFor = (type: (typeof DOC_TYPES)[number]) => (type === "ASSET_IMAGE" ? UPLOAD_LIMITS.image : UPLOAD_LIMITS.document);

/** Step 1: returns a one-time URL the browser uploads the file to. */
export async function prepareAssetUpload(input: z.input<typeof fileMeta>): Promise<ActionResult<{ path: string; signedUrl: string }>> {
  return runAction(async () => {
    const actor = await authorize("asset:update");
    const meta = fileMeta.parse(input);
    const asset = await db.asset.findFirst({ where: { id: meta.assetId, deletedAt: null }, select: { id: true } });
    if (!asset) throw new ActionError("This asset no longer exists.");
    // Path is namespaced to the asset and the uploader; step 2 checks it.
    return ok(
      await createUploadTarget({ folder: `assets/${asset.id}/${actor.id}`, fileName: meta.fileName, mimeType: meta.mimeType, size: meta.size, allowed: allowedFor(meta.type) }),
    );
  });
}

/** Step 2: verifies the uploaded object and records it against the asset. */
export async function attachAssetDocument(input: z.input<typeof fileMeta> & { path: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("asset:update");
    const meta = fileMeta.parse(input);
    if (!input.path.startsWith(`assets/${meta.assetId}/${actor.id}/`) || input.path.includes("..")) {
      throw new ActionError("Invalid upload reference.");
    }
    await verifyUpload(input.path, meta.mimeType, meta.size);

    await db.$transaction(async (tx) => {
      const doc = await tx.assetDocument.create({
        data: {
          type: meta.type,
          fileName: meta.fileName,
          storagePath: input.path,
          mimeType: meta.mimeType,
          sizeBytes: meta.size,
          assetId: meta.assetId,
          uploadedById: actor.id,
        },
      });
      await writeAudit(
        { actorId: actor.id, action: "asset.document_add", entityType: "Asset", entityId: meta.assetId, summary: `Uploaded ${meta.fileName}`, after: { documentId: doc.id, type: meta.type } },
        tx,
      );
    });

    refresh();
    return ok(undefined, "File uploaded");
  });
}

export async function deleteAssetDocument(input: { documentId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("asset:update");
    const doc = await db.assetDocument.findUnique({ where: { id: input.documentId } });
    if (!doc?.assetId) throw new ActionError("This file no longer exists.");

    await db.$transaction(async (tx) => {
      await tx.assetDocument.delete({ where: { id: doc.id } });
      await writeAudit(
        { actorId: actor.id, action: "asset.document_delete", entityType: "Asset", entityId: doc.assetId!, summary: `Deleted ${doc.fileName}` },
        tx,
      );
    });
    await removeFiles([doc.storagePath]);

    refresh();
    return ok(undefined, "File deleted");
  });
}

/** Short-lived download link for any stored document. */
export async function getAssetDocumentUrl(input: { documentId: string }): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const user = await authorize();
    if (!hasAnyPermission(user, "asset:read", "assignment:read", "maintenance:read")) throw new ActionError("You do not have access to this file.");
    const doc = await db.assetDocument.findUnique({ where: { id: input.documentId }, select: { storagePath: true } });
    if (!doc) throw new ActionError("This file no longer exists.");
    return ok({ url: await signedUrl(doc.storagePath, 300) });
  });
}
