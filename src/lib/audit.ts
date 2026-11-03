import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient;

export type AuditEntry = {
  actorId: string | null;
  action: string; // "<entity>.<verb>", e.g. "asset.create"
  entityType: string;
  entityId: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

async function clientIp() {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  } catch {
    return null; // called outside a request (seed, cron)
  }
}

function toJson(value: unknown) {
  // Decimal / Date values serialize through JSON; undefined becomes DB NULL.
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

/** Write an audit row. Pass the transaction client so it commits with the change. */
export async function writeAudit(entry: AuditEntry, tx: Tx = db) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ipAddress: await clientIp(),
    },
  });
}
