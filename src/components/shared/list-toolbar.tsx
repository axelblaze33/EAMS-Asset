"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Option } from "./form-fields";

/** `allLabel` names the "no filter" choice when it means something specific (e.g. a default range). */
export type FilterDef = { key: string; label: string; options: Option[]; allLabel?: string };

const ALL = "__all";

/** Search box + filter selects that write to the URL; the server page re-renders. */
export function ListToolbar({
  searchPlaceholder = "Search…",
  showSearch = true,
  filters = [],
  children,
}: {
  searchPlaceholder?: string;
  showSearch?: boolean;
  filters?: FilterDef[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false }));
  }

  // Debounce typing so every keystroke doesn't hit the database.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update({ q: q.trim() || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeFilters = filters.filter((f) => params.get(f.key));

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {showSearch && (
        <div className="relative w-full sm:w-72">
          {pending ? (
            <Loader2 className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label="Search" />
        </div>
        )}
        {filters.map((f) => {
          const options = [{ value: ALL, label: f.allLabel ?? `All ${f.label.toLowerCase()}` }, ...f.options];
          return (
            <Select
              key={f.key}
              items={options}
              value={params.get(f.key) ?? ALL}
              onValueChange={(v) => update({ [f.key]: v === ALL ? undefined : (v as string) })}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-36" aria-label={f.label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}
        {(activeFilters.length > 0 || params.get("q")) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              update(Object.fromEntries([["q", undefined], ...filters.map((f) => [f.key, undefined])]));
            }}
          >
            <X />
            Clear
          </Button>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
