"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-fields";
import { AccessoryInput } from "./accessory-input";
import { updateHandoverAccessories } from "./actions";
import { accessorySuggestions, sameAccessories } from "./schemas";

type Item = { id: string; label: string; categoryName: string; accessories: string[]; acknowledged: boolean };

/** Staff correct the accessories on assets that are still out with the employee. */
export function EditAccessories({ items }: { items: Item[] }) {
  const original = () => Object.fromEntries(items.map((i) => [i.id, i.accessories]));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string[]>>(original);
  const [saving, startTransition] = useTransition();

  const changed = items.filter((i) => !sameAccessories(values[i.id] ?? i.accessories, i.accessories));
  const signedChanged = changed.some((i) => i.acknowledged);

  function save() {
    startTransition(async () => {
      const r = await updateHandoverAccessories({ items: changed.map((i) => ({ assignmentId: i.id, accessories: values[i.id] ?? i.accessories })) });
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setValues(original());
          setOpen(true);
        }}
      >
        <Pencil />
        Edit accessories
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit accessories</DialogTitle>
            <DialogDescription>Add or remove what was handed over with each asset. Changes are kept in the audit log.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {items.map((i) => (
              <Field key={i.id} label={i.label}>
                <AccessoryInput
                  value={values[i.id] ?? i.accessories}
                  onChange={(v) => setValues((s) => ({ ...s, [i.id]: v }))}
                  // Saved values stay listed, so one removed by mistake can be turned back on.
                  suggestions={[...accessorySuggestions(i.categoryName), ...i.accessories]}
                  disabled={saving}
                />
              </Field>
            ))}
          </div>

          {signedChanged && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
              This changes an acknowledged handover, so any form already signed won&apos;t match. Download the updated PDF if it needs signing again.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || changed.length === 0}>
              {saving && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
