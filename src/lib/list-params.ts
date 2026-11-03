import { z } from "zod";

// Lists keep their state (search, filters, sort, page) in the URL, so views are
// shareable, survive reloads and work with the browser back button.

export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export function param(sp: SearchParams, key: string) {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

export function parseList<S extends string>(
  sp: SearchParams,
  opts: { sortable: readonly S[]; defaultSort: S; defaultDir?: "asc" | "desc" },
) {
  const page = z.coerce.number().int().min(1).catch(1).parse(param(sp, "page") ?? 1);
  const pageSize = z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(25)
    .parse(param(sp, "size") ?? 25);
  const sortParam = param(sp, "sort") as S | undefined;
  const sort = sortParam && opts.sortable.includes(sortParam) ? sortParam : opts.defaultSort;
  const dir = param(sp, "dir") === "asc" ? "asc" : param(sp, "dir") === "desc" ? "desc" : (opts.defaultDir ?? "asc");
  return { page, pageSize, sort, dir: dir as "asc" | "desc", q: param(sp, "q"), skip: (page - 1) * pageSize };
}

/** Returns the value only if it is one of the allowed enum values. */
export function enumParam<T extends string>(sp: SearchParams, key: string, values: readonly T[]) {
  const v = param(sp, key);
  return v && (values as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Builds an href that changes some params and keeps the rest. */
export function hrefWith(pathname: string, sp: SearchParams, changes: Record<string, string | number | undefined>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) next.set(k, s);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === "") next.delete(k);
    else next.set(k, String(v));
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
