"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ComboboxField, Field, SelectField, type Option } from "@/components/shared/form-fields";
import { FilePicker, uploadStaged } from "@/components/shared/file-picker";
import { ASSET_STATUS, MAINTENANCE_STATUS, PRIORITY } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { updateTicket } from "./actions";
import { AFTER_REPAIR, MAINTENANCE_STATUSES, PRIORITIES } from "./schemas";

type Ticket = {
  id: string;
  status: (typeof MAINTENANCE_STATUSES)[number];
  priority: (typeof PRIORITIES)[number];
  assigneeId: string | null;
  vendorId: string | null;
  cost: string;
  startedAt: string;
  completedAt: string;
  resolutionNotes: string;
  assetUnderMaintenance: boolean;
};

export function TicketUpdate({ ticket, assignees, vendors, today, storageReady }: { ticket: Ticket; assignees: Option[]; vendors: Option[]; today: string; storageReady: boolean }) {
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState({ ...ticket, afterStatus: "AVAILABLE" as (typeof AFTER_REPAIR)[number] });
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const completing = v.status === "COMPLETED";

  function save() {
    const errs: Record<string, string> = {};
    if (completing && !v.completedAt) errs.completedAt = "Enter the completion date";
    if (v.completedAt && v.startedAt && v.completedAt < v.startedAt) errs.completedAt = "Can't be before the start date";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    startTransition(async () => {
      try {
        const documents = files.length ? await uploadStaged(files) : [];
        const r = await updateTicket({ ...v, documents });
        if (!r.ok) {
          setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, m]) => [k, m[0]!])));
          toast.error(r.error);
          return;
        }
        toast.success(r.message);
        setFiles([]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Status">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Status">
          {MAINTENANCE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={v.status === s}
              onClick={() => {
                set("status", s);
                if (s === "COMPLETED" && !v.completedAt) set("completedAt", today);
              }}
              className={cn(
                "rounded-md border bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted/50",
                v.status === s && "border-primary bg-brand-soft/60 font-medium ring-1 ring-primary/30",
              )}
            >
              {MAINTENANCE_STATUS[s].label}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priority">
          <SelectField value={v.priority} onChange={(x) => set("priority", x as Ticket["priority"])} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label }))} />
        </Field>
        <Field label="Assigned to">
          <ComboboxField value={v.assigneeId} onChange={(x) => set("assigneeId", x || null)} options={assignees} placeholder="Unassigned" />
        </Field>
        <Field label="Service provider">
          <ComboboxField value={v.vendorId} onChange={(x) => set("vendorId", x || null)} options={vendors} placeholder="None" />
        </Field>
        <Field label="Repair cost, ₹" htmlFor="cost">
          <Input id="cost" inputMode="decimal" value={v.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" />
        </Field>
        <Field label="Started" htmlFor="startedAt">
          <Input id="startedAt" type="date" max={today} value={v.startedAt} onChange={(e) => set("startedAt", e.target.value)} />
        </Field>
        <Field label={completing ? "Completed" : "Completed (when done)"} htmlFor="completedAt" error={errors.completedAt}>
          <Input id="completedAt" type="date" max={today} min={v.startedAt || undefined} value={v.completedAt} disabled={!completing} onChange={(e) => set("completedAt", e.target.value)} aria-invalid={!!errors.completedAt} />
        </Field>
      </div>
      {completing && ticket.assetUnderMaintenance && (
        <Field label="After the repair, the asset is" hint="Applied once no other repair on this asset is still open.">
          <SelectField value={v.afterStatus} onChange={(x) => set("afterStatus", x as typeof v.afterStatus)} options={AFTER_REPAIR.map((s) => ({ value: s, label: ASSET_STATUS[s].label }))} />
        </Field>
      )}
      {v.status === "CANCELLED" && ticket.assetUnderMaintenance && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Cancelling restores the asset to the status it had before this ticket.</p>
      )}
      <Field label="Resolution / notes" htmlFor="resolution">
        <Textarea id="resolution" rows={3} value={v.resolutionNotes} onChange={(e) => set("resolutionNotes", e.target.value)} placeholder="e.g. Battery replaced under warranty" />
      </Field>
      <Field label="Invoices and repair documents">
        <FilePicker files={files} onChange={setFiles} storageReady={storageReady} disabled={pending} label="Attach invoice" />
      </Field>
      <Button onClick={save} disabled={pending} className="w-full sm:w-auto">
        {pending && <Loader2 className="animate-spin" />}
        {completing ? "Complete ticket" : v.status === "CANCELLED" ? "Cancel ticket" : "Save changes"}
      </Button>
    </div>
  );
}
