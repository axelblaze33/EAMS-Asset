import "server-only";
import { db } from "@/lib/db";

/** Password entries for an asset, without any encrypted values. */
export async function listCredentials(assetId: string) {
  const rows = await db.assetCredential.findMany({
    where: { assetId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      username: true,
      notes: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
      history: {
        orderBy: { changedAt: "desc" },
        select: { id: true, event: true, username: true, reason: true, changedAt: true, changedBy: { select: { name: true } }, secret: true },
      },
    },
  });
  // Only whether a version has a stored value reaches the browser, never the value.
  return rows.map((r) => ({ ...r, history: r.history.map(({ secret, ...h }) => ({ ...h, hasSecret: !!secret })) }));
}
export type CredentialRow = Awaited<ReturnType<typeof listCredentials>>[number];
