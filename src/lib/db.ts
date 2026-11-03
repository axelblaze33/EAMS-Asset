import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// One client per server instance. In dev, hot reload would otherwise open a new
// pool on every edit. On Vercel, DATABASE_URL should be the pooled (pgbouncer /
// Supavisor / Neon pooler) connection string.
//
// Dev note: after `prisma generate` / `prisma migrate`, restart `npm run dev`.
// The cached client keeps the schema it was created with ("Unknown field ...").
// It can't be swapped automatically: Next bundles the generated client per route,
// so class identity checks don't work across bundles.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 5) });
  globalForPrisma.prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  return globalForPrisma.prisma;
}

// Created on first use rather than at import, so `next build` can load route
// modules without database credentials.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
