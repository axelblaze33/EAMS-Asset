"use server";

import { z } from "zod";
import { authorize, getCurrentUser, hasAnyPermission } from "@/lib/auth/dal";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";
import { UPLOAD_LIMITS, createUploadTarget, stagingFolder } from "@/lib/storage";

const schema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  imagesOnly: z.boolean().optional(),
});

/** One-time upload URL into the caller's staging folder (see lib/storage). */
export async function prepareStagedUpload(input: z.input<typeof schema>): Promise<ActionResult<{ path: string; signedUrl: string }>> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) await authorize(); // throws the session-expired error
    if (!hasAnyPermission(user, "assignment:create", "assignment:return", "maintenance:manage", "asset:update")) {
      throw new ActionError("You do not have permission to upload files.");
    }
    const meta = schema.parse(input);
    return ok(
      await createUploadTarget({
        folder: stagingFolder(user!.id),
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        size: meta.size,
        allowed: meta.imagesOnly ? UPLOAD_LIMITS.image : UPLOAD_LIMITS.document,
      }),
    );
  });
}
