"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PackageOpen, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CategoryIcon } from "@/components/shared/category-icon";
import { ComboboxField, Field, SelectField } from "@/components/shared/form-fields";
import { FilePicker, uploadStaged } from "@/components/shared/file-picker";
import { ASSET_CONDITION, EMPLOYMENT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { createAssignments } from "./actions";
import { AccessoryInput } from "./accessory-input";
import { accessorySuggestions } from "./schemas";

type Options = {
  employees: { id: string; fullName: string; employeeCode: string; employmentStatus: string; department: { name: string } | null; _count: { assignments: number } }[];
  assets: { id: string; assetCode: string; name: string; serialNumber: string | null; condition: string; category: { name: string }; branch: { name: string } | null }[];
};
type Item = { assetId: string; condition: string; accessories: string[] };

const CONDITIONS = Object.entries(ASSET_CONDITION).map(([value, m]) => ({ value, label: m.label }));

export function AssignForm({
  options,
  today,
  initialEmployeeId,
  initialAssetId,
  request,
  storageReady,
}: {
  options: Options;
  today: string;
  initialEmployeeId?: string;
  initialAssetId?: string;
  request?: { id: string; code: string; category: string; employeeId: string };
  storageReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const assetById = useMemo(() => new Map(options.assets.map((a) => [a.id, a])), [options.assets]);
  const newItem = (id: string): Item => {
    const a = assetById.get(id)!;
    return { assetId: id, condition: a.condition, accessories: /laptop/i.test(a.category.name) ? ["Charger"] : [] };
  };

  const [employeeId, setEmployeeId] = useState(request?.employeeId ?? initialEmployeeId ?? "");
  const [items, setItems] = useState<Item[]>(initialAssetId && assetById.has(initialAssetId) ? [newItem(initialAssetId)] : []);
  const [assignedAt, setAssignedAt] = useState(today);
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [remarks, setRemarks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState(request?.category ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const employee = options.employees.find((e) => e.id === employeeId);
  const selected = new Set(items.map((i) => i.assetId));
  const q = query.trim().toLowerCase();
  const matches = options.assets.filter((a) =>
    !q ? true : [a.assetCode, a.name, a.serialNumber, a.category.name, a.branch?.name].some((v) => v?.toLowerCase().includes(q)),
  );

  function toggle(id: string) {
    setItems((prev) => (prev.some((i) => i.assetId === id) ? prev.filter((i) => i.assetId !== id) : [...prev, newItem(id)]));
  }
  const update = (id: string, patch: Partial<Item>) => setItems((prev) => prev.map((i) => (i.assetId === id ? { ...i, ...patch } : i)));

  function submit() {
    const errs: Record<string, string> = {};
    if (!employeeId) errs.employeeId = "Choose an employee";
    if (!items.length) errs.items = "Choose at least one asset";
    if (!assignedAt) errs.assignedAt = "Enter a date";
    if (assignedAt > today) errs.assignedAt = "Can't be in the future";
    if (expectedReturnAt && expectedReturnAt < assignedAt) errs.expectedReturnAt = "Must be on or after the assignment date";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    startTransition(async () => {
      try {
        const documents = files.length ? await uploadStaged(files) : [];
        const result = await createAssignments({
          employeeId,
          assignedAt,
          expectedReturnAt,
          remarks,
          requestId: request?.id,
          items: items as never,
          documents,
        });
        if (!result.ok) {
          setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v[0]!])));
          toast.error(result.error);
          return;
        }
        toast.success(result.message);
        router.push(`/assignments/handover/${result.data.ref}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Employee</CardTitle>
            <CardDescription>Who is receiving the assets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Employee" error={errors.employeeId}>
              <ComboboxField
                value={employeeId}
                onChange={setEmployeeId}
                disabled={!!request}
                invalid={!!errors.employeeId}
                placeholder="Search by name or employee ID"
                searchPlaceholder="Name, ID or department…"
                options={options.employees.map((e) => ({
                  value: e.id,
                  label: `${e.fullName} (${e.employeeCode})`,
                  hint: [e.department?.name, e._count.assignments ? `${e._count.assignments} asset(s) held` : null, e.employmentStatus !== "ACTIVE" ? EMPLOYMENT_STATUS[e.employmentStatus as keyof typeof EMPLOYMENT_STATUS].label : null]
                    .filter(Boolean)
                    .join(" · "),
                }))}
              />
            </Field>
            {request && (
              <p className="rounded-md bg-brand-soft px-3 py-2 text-sm text-primary">
                Fulfilling request {request.code} for a {request.category.toLowerCase()}.
              </p>
            )}
            {employee?.employmentStatus === "ON_NOTICE" && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">This employee is serving notice.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available assets</CardTitle>
            <CardDescription>{options.assets.length} available. Select one or more to hand over together.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by ID, name, serial, category, branch…" className="pl-8" aria-label="Filter available assets" />
            </div>
            {errors.items && <p className="text-xs text-destructive">{errors.items}</p>}
            <div className="max-h-[420px] overflow-y-auto rounded-lg border">
              {matches.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                  <PackageOpen className="size-5" />
                  {options.assets.length === 0 ? "No assets are available right now." : "No available assets match."}
                </div>
              ) : (
                <ul className="divide-y">
                  {matches.map((a) => {
                    const on = selected.has(a.id);
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => toggle(a.id)}
                          aria-pressed={on}
                          className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50", on && "bg-brand-soft/60 hover:bg-brand-soft")}
                        >
                          <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
                            {on && <Check className="size-3" />}
                          </span>
                          <CategoryIcon name={a.category.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{a.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              <span className="font-mono">{a.assetCode}</span>
                              {a.serialNumber && ` · S/N ${a.serialNumber}`}
                              {a.branch && ` · ${a.branch.name}`}
                            </span>
                          </span>
                          <span className="hidden text-xs text-muted-foreground sm:block">{a.category.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Handover</CardTitle>
          <CardDescription>{items.length ? `${items.length} asset${items.length === 1 ? "" : "s"} selected` : "Nothing selected yet"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {items.length > 0 && (
            <ul className="space-y-3">
              {items.map((item) => {
                const a = assetById.get(item.assetId)!;
                return (
                  <li key={item.assetId} className="space-y-2.5 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{a.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{a.assetCode}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => toggle(a.id)} aria-label={`Remove ${a.assetCode}`}>
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs">
                      <span className="text-muted-foreground">Condition</span>
                      <SelectField value={item.condition} onChange={(v) => update(a.id, { condition: v })} options={CONDITIONS} />
                      <span className="self-start pt-1 text-muted-foreground">Accessories</span>
                      <AccessoryInput value={item.accessories} onChange={(v) => update(a.id, { accessories: v })} suggestions={accessorySuggestions(a.category.name)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Assignment date" htmlFor="assignedAt" error={errors.assignedAt}>
              <Input id="assignedAt" type="date" max={today} value={assignedAt} onChange={(e) => setAssignedAt(e.target.value)} aria-invalid={!!errors.assignedAt} />
            </Field>
            <Field label="Return by (optional)" htmlFor="expectedReturnAt" error={errors.expectedReturnAt}>
              <Input id="expectedReturnAt" type="date" min={assignedAt} value={expectedReturnAt} onChange={(e) => setExpectedReturnAt(e.target.value)} aria-invalid={!!errors.expectedReturnAt} />
            </Field>
          </div>
          <Field label="Remarks (optional)" htmlFor="remarks">
            <Textarea id="remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Replacement for AST-000012" />
          </Field>
          <Field label="Handover documents (optional)">
            <FilePicker files={files} onChange={setFiles} storageReady={storageReady} disabled={pending} label="Attach signed form or photos" />
          </Field>

          <Button className="w-full" onClick={submit} disabled={pending || !items.length || !employeeId}>
            {pending && <Loader2 className="animate-spin" />}
            Assign {items.length > 1 ? `${items.length} assets` : "asset"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Next you&apos;ll get a handover form to print for the employee&apos;s signature.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
