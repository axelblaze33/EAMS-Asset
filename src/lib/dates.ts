import { z } from "zod";

// Calendar dates (purchase date, joining date, ...) are stored as Postgres DATE
// and handled as UTC midnight so they never shift with the server's timezone.

/** Parses YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY. Returns null if invalid. */
export function parseDateInput(value: string): Date | null {
  const s = value.trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/** YYYY-MM-DD for <input type="date"> values. */
export function toDateInput(date: Date | string | null | undefined) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Optional date field: "" → null, otherwise a valid calendar date. */
export const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = parseDateInput(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return d;
  });

export const requiredDate = z
  .string({ error: "Enter a date" })
  .trim()
  .min(1, "Enter a date")
  .transform((v, ctx) => {
    const d = parseDateInput(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return d;
  });
