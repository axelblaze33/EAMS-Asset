"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-fields";
import { ACKNOWLEDGEMENT_METHOD } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { recordAcknowledgement } from "./actions";
import { ACKNOWLEDGEMENT_METHODS } from "./schemas";

type Pending = { id: string; label: string };

/** Staff record that the employee confirmed receipt of one or more assets. */
export function RecordAcknowledgement({
  employeeName,
  pending,
  minDate,
  today,
}: {
  employeeName: string;
  pending: Pending[];
  minDate: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(pending.map((p) => p.id));
  const [method, setMethod] = useState<(typeof ACKNOWLEDGEMENT_METHODS)[number]>("SIGNED_FORM");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [pending_, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await recordAcknowledgement({ assignmentIds: selected, method, acknowledgedOn: date, note });
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <Button
        onClick={() => {
          setSelected(pending.map((p) => p.id));
          setOpen(true);
        }}
      >
        <CheckCircle2 />
        Record acknowledgement
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record acknowledgement</DialogTitle>
            <DialogDescription>Confirm that {employeeName} received these assets in the stated condition.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {pending.length > 1 && (
              <Field label="Assets">
                <div className="space-y-1.5 rounded-lg border p-2">
                  {pending.map((p) => (
                    <label key={p.id} className="flex items-center gap-2.5 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                      <Checkbox
                        checked={selected.includes(p.id)}
                        onCheckedChange={(v) => setSelected((s) => (v === true ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </Field>
            )}
            <Field label="How did they confirm?">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Acknowledgement method">
                {ACKNOWLEDGEMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      "rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                      method === m && "border-primary bg-brand-soft/60 ring-1 ring-primary/30",
                    )}
                  >
                    {ACKNOWLEDGEMENT_METHOD[m].label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Date confirmed" htmlFor="ack-date">
              <Input id="ack-date" type="date" min={minDate} max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Note (optional)" htmlFor="ack-note" hint={method === "SIGNED_FORM" ? "Attach the scanned form under Signed copy." : undefined}>
              <Input id="ack-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={method === "EMAIL" ? "e.g. Reply received 4 Nov from personal email" : ""} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending_}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending_ || selected.length === 0 || !date}>
              {pending_ && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
