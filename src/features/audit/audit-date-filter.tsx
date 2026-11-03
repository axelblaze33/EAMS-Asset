"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

/** From/to date inputs that write to the URL (used next to list toolbars). */
export function AuditDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  return (
    <div className="flex items-center gap-2">
      <Input type="date" aria-label="From date" className="w-38" value={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} />
      <span className="text-sm text-muted-foreground">to</span>
      <Input type="date" aria-label="To date" className="w-38" value={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} />
    </div>
  );
}
