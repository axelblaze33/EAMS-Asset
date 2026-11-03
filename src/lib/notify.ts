import "server-only";
import type { NotificationType, Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** In-app notifications for staff (shown in the bell). */
export async function notifyUsers(
  tx: Tx,
  userIds: string[],
  n: { type: NotificationType; title: string; message: string; link?: string; dedupeKey?: string },
) {
  if (userIds.length === 0) return;
  await tx.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...n, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${userId}` : undefined })),
    skipDuplicates: true,
  });
}

/** Active users holding a permission, e.g. everyone who can approve requests. */
export async function usersWithPermission(tx: Tx, permission: string) {
  const users = await tx.user.findMany({
    where: { isActive: true, role: { permissions: { some: { permission: { key: permission } } } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
