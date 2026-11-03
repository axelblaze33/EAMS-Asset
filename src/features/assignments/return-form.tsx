"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectField } from "@/components/shared/form-fields";
import { FilePicker, uploadStaged } from "@/components/shared/file-picker";
import { ASSET_CONDITION, ASSET_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { processReturn } from "./actions";
import { RETURN_NEXT_STATUSES } from "./schemas";

const CONDITIONS = Object.entries(ASSET_CONDITION).map(([value, m]) => ({ value, label: m.label }));

const NEXT_HINT: Record<(typeof RETURN_NEXT_STATUSES)[number], string> = {
  AVAILABLE: "Ready to assign to someone else",
  UNDER_MAINTENANCE: "Opens a repair ticket automatically",
  DAMAGED: "Not usable; awaiting a decision",
  RETIRED: "Taken out of service",
};

export function ReturnForm({
  assignmentId,
  assetId,
  accessories,
  conditionAtHandover,
  assignedAt,
  today,
  storageReady,
}: {
  assignmentId: string;
  assetId: string;
  accessories: string[];
  conditionAtHandover: string;
  assignedAt: string;
  today: string;
  storageReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [returnedAt, setReturnedAt] = useState(today);
  const [condition, setCondition] = useState(conditionAtHandover);
  const [returned, setReturned] = useState<string[]>(accessories);
  const [damageNotes, setDamageNotes] = useState("");
  const [deductionAmount, setDeductionAmount] = useState("");
  const [deductionNotes, setDeductionNotes] = useState("");
  const [remarks, setRemarks] = useState("");
  const [nextStatus, setNextStatus] = useState<(typeof RETURN_NEXT_STATUSES)[number]>("AVAILABLE");
  const [photos, setPhotos] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const missing = accessories.filter((a) => !returned.includes(a));
  const damaged = condition === "DAMAGED" || condition === "POOR";

  function onCondition(v: string) {
    setCondition(v);
    // Sensible default; the admin can still choose otherwise.
    if (v === "DAMAGED") setNextStatus("DAMAGED");
    else if (v === "POOR") setNextStatus("UNDER_MAINTENANCE");
  }

  function submit() {
    const errs: Record<string, string> = {};
    if (!returnedAt) errs.returnedAt = "Enter a date";
    else if (returnedAt > today) errs.returnedAt = "Can't be in the future";
    else if (returnedAt < assignedAt) errs.returnedAt = "Can't be before the assignment date";
    if (damaged && !damageNotes.trim()) errs.damageNotes = "Describe the damage";
    if (deductionAmount && !(Number(deductionAmount.replace(/,/g, "")) >= 0)) errs.deductionAmount = "Enter a valid amount";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    startTransition(async () => {
      try {
        const staged = photos.length ? await uploadStaged(photos) : [];
        const result = await processReturn({
          assignmentId,
          returnedAt,
          condition: condition as never,
          missingAccessories: missing,
          damageNotes,
          deductionAmount,
          deductionNotes,
          remarks,
          nextStatus,
          photos: staged,
        });
        if (!result.ok) {
          setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v[0]!])));
          toast.error(result.error);
          return;
        }
        toast.success(result.message);
        router.push(`/assets/${assetId}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Inspection</CardTitle>
          <CardDescription>Record what came back and in what state.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Return date" htmlFor="returnedAt" error={errors.returnedAt}>
            <Input id="returnedAt" type="date" min={assignedAt} max={today} value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} aria-invalid={!!errors.returnedAt} />
          </Field>
          <Field label="Condition on return" hint={`Handed over as ${ASSET_CONDITION[conditionAtHandover as keyof typeof ASSET_CONDITION]?.label ?? conditionAtHandover}.`}>
            <SelectField value={condition} onChange={onCondition} options={CONDITIONS} />
          </Field>
          {accessories.length > 0 && (
            <Field label="Accessories returned" className="sm:col-span-2" hint={missing.length ? `Missing: ${missing.join(", ")}` : "All accessories returned."}>
              <div className="flex flex-wrap gap-1.5">
                {accessories.map((a) => {
                  const on = returned.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setReturned((r) => (on ? r.filter((x) => x !== a) : [...r, a]))}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                        on ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-destructive/40 bg-destructive/5 text-destructive line-through",
                      )}
                    >
                      {on && <Check className="size-3" />}
                      {a}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          <Field label={damaged ? "Damage details" : "Damage details (optional)"} htmlFor="damageNotes" error={errors.damageNotes} className="sm:col-span-2">
            <Textarea id="damageNotes" rows={2} value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} placeholder="e.g. Cracked hinge on the left side" aria-invalid={!!errors.damageNotes} />
          </Field>
          <Field label="Return photos (optional)" className="sm:col-span-2">
            <FilePicker files={photos} onChange={setPhotos} storageReady={storageReady} disabled={pending} label="Add photos" max={8} accept="image/jpeg,image/png,image/webp,application/pdf" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recovery</CardTitle>
          <CardDescription>Only if a deduction applies for damage or missing items.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Field label="Deduction, ₹ (optional)" htmlFor="deductionAmount" error={errors.deductionAmount}>
            <Input id="deductionAmount" inputMode="decimal" value={deductionAmount} onChange={(e) => setDeductionAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Deduction / repair notes (optional)" htmlFor="deductionNotes">
            <Input id="deductionNotes" value={deductionNotes} onChange={(e) => setDeductionNotes(e.target.value)} placeholder="e.g. Charger replacement as per policy" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What happens to the asset next?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Next status">
            {RETURN_NEXT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={nextStatus === s}
                onClick={() => setNextStatus(s)}
                className={cn(
                  "rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                  nextStatus === s && "border-primary bg-brand-soft/60 ring-1 ring-primary/30 hover:bg-brand-soft/60",
                )}
              >
                <div className="text-sm font-medium">{ASSET_STATUS[s].label}</div>
                <div className="text-xs text-muted-foreground">{NEXT_HINT[s]}</div>
              </button>
            ))}
          </div>
          <Field label="Remarks (optional)" htmlFor="remarks">
            <Textarea id="remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Complete return
        </Button>
      </div>
    </div>
  );
}
