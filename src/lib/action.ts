import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AuthorizationError } from "@/lib/auth/dal";

import type { ActionResult } from "./action-result";

export type { ActionResult };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

// Prisma reports the violated columns as meta.target with the classic engine and
// under meta.driverAdapterError with driver adapters (Prisma 7).
function uniqueFields(meta: Record<string, unknown> | undefined): string[] {
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  const cause = (meta?.driverAdapterError as { cause?: AdapterCause } | undefined)?.cause;
  if (cause?.constraint?.fields) return cause.constraint.fields.map((f) => f.replace(/"/g, ""));
  // Postgres default unique index names are "<table>_<col>[_<col>]_key".
  const index = cause?.constraint?.index;
  if (index && cause?.table && index.startsWith(`${cause.table}_`) && index.endsWith("_key")) {
    return [index.slice(cause.table.length + 1, -"_key".length)];
  }
  return [];
}

type AdapterCause = { table?: string; constraint?: { fields?: string[]; index?: string } };

const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Known business-rule violation; its message is safe to show the user. */
export class ActionError extends Error {}

/**
 * Wraps a server action body so that validation, authorization and known database
 * errors come back as a typed result instead of an opaque 500. Unknown errors are
 * logged server-side and returned as a generic message, so internals never leak.
 */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const { fieldErrors } = z.flattenError(err);
      return fail("Please fix the highlighted fields.", fieldErrors as Record<string, string[]>);
    }
    if (err instanceof AuthorizationError || err instanceof ActionError) {
      return fail(err.message);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        const fields = uniqueFields(err.meta);
        return fail(
          `A record with this ${fields.length ? fields.join(", ").replace(/_/g, " ") : "value"} already exists.`,
          Object.fromEntries(fields.map((f) => [snakeToCamel(f), ["Already in use"]])),
        );
      }
      if (err.code === "P2025") return fail("The record no longer exists. Refresh and try again.");
      if (err.code === "P2034") return fail("Another change happened at the same time. Please try again.");
    }
    // Next.js uses thrown errors for redirect()/notFound(); let them propagate.
    if (err instanceof Error && "digest" in err && typeof err.digest === "string" && err.digest.startsWith("NEXT_")) {
      throw err;
    }
    console.error("[action] unexpected error", err);
    return fail("Something went wrong. Please try again.");
  }
}
