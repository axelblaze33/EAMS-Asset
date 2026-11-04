import type { PoolConfig } from "pg";

/**
 * node-postgres options for a connection string, used by the app and the seed.
 *
 * pg v8 treats `sslmode=require` as full certificate verification against Node's
 * trust store. Supabase (and some other hosts) sign their server certificates
 * with their own CA, so that fails with "self-signed certificate in certificate
 * chain". We apply standard libpq semantics instead:
 *   - sslmode=require/prefer  → encrypted connection (like psql and Prisma Migrate)
 *   - DATABASE_CA_CERT set    → encrypted AND verified against that CA (recommended)
 *   - sslmode=verify-full     → left to pg's default verification
 */
export function pgConfig(connectionString: string, extra: Partial<PoolConfig> = {}): PoolConfig {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();

  if (ca || mode === "require" || mode === "prefer" || mode === "no-verify") {
    // Connection-string SSL params override `ssl` in pg, so remove them here.
    for (const k of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(k);
    return { ...extra, connectionString: url.toString(), ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } };
  }
  return { ...extra, connectionString };
}
