import "server-only";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export const CODE_PREFIX = {
  asset: "AST",
  request: "REQ",
  maintenance: "MNT",
} as const;

/**
 * Returns the next human-readable code (e.g. AST-000124). The upsert takes a row
 * lock on the counter, so concurrent transactions get distinct numbers.
 */
export async function nextCode(tx: Tx, key: keyof typeof CODE_PREFIX) {
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${CODE_PREFIX[key]}-${String(counter.value).padStart(6, "0")}`;
}
