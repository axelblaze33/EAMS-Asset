"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, FileText, Loader2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ComboboxField, SelectField, type Option } from "@/components/shared/form-fields";
import type { FilterKey } from "./types";

const ALL = "__all";

export function ReportFilterBar({
  reportKey,
  filters,
  dateLabel,
  dateHint,
  options,
  canExport,
}: {
  reportKey: string;
  filters: FilterKey[];
  dateLabel?: string;
  dateHint?: string;
  options: { departments: Option[]; categories: Option[]; employees: (Option & { hint?: string })[]; assets?: (Option & { hint?: string })[]; statuses?: Option[] };
  canExport: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const has = (k: FilterKey) => filters.includes(k);

  function set(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false }));
  }

  const active = filters.some((k) => params.get(k));
  const exportHref = (format: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("format", format);
    return `/api/reports/${reportKey}?${next}`;
  };
  const select = (key: FilterKey, label: string, opts: Option[]) => (
    <div className="w-full space-y-1.5 sm:w-48">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <SelectField value={params.get(key) ?? ALL} onChange={(v) => set(key, v)} options={[{ value: ALL, label: `All ${label.toLowerCase()}` }, ...opts]} />
    </div>
  );

  return (
    <div data-print-hide className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-wrap items-end gap-3">
        {(has("from") || has("to")) && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{dateLabel ?? "Date range"}</Label>
            <div className="flex items-center gap-2">
              {has("from") && <Input type="date" aria-label="From" className="w-40" value={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} />}
              {has("from") && has("to") && <span className="text-sm text-muted-foreground">to</span>}
              {has("to") && <Input type="date" aria-label={has("from") ? "To" : dateLabel} className="w-40" value={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} />}
            </div>
            {dateHint && !params.get("from") && !params.get("to") && <p className="text-xs text-muted-foreground">{dateHint}</p>}
          </div>
        )}
        {has("department") && select("department", "Departments", options.departments)}
        {has("category") && select("category", "Categories", options.categories)}
        {has("status") && options.statuses && select("status", "Statuses", options.statuses)}
        {has("asset") && options.assets && (
          <div className="w-full space-y-1.5 sm:w-72">
            <Label className="text-xs text-muted-foreground">Asset</Label>
            <ComboboxField value={params.get("asset")} onChange={(v) => set("asset", v)} options={options.assets} placeholder="All assets" searchPlaceholder="Asset ID, name or serial…" />
          </div>
        )}
        {has("employee") && (
          <div className="w-full space-y-1.5 sm:w-60">
            <Label className="text-xs text-muted-foreground">Employee</Label>
            <ComboboxField value={params.get("employee")} onChange={(v) => set("employee", v)} options={options.employees} placeholder="All employees" />
          </div>
        )}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
            className="mb-0.5"
          >
            <X />
            Clear
          </Button>
        )}
        {pending && <Loader2 className="mb-2 size-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer />
          Print
        </Button>
        {canExport && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button />}>
              <Download />
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem render={<a href={exportHref("xlsx")} download />}>
                <FileSpreadsheet />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href={exportHref("csv")} download />}>
                <FileText />
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href={exportHref("pdf")} target="_blank" />}>
                <FileText />
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
