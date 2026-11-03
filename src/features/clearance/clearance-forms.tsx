"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Loader2, MoreHorizontal, SearchX, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ComboboxField, Field, type Option } from "@/components/shared/form-fields";
import { cancelClearance, completeClearance, initiateClearance, resolveClearanceItem } from "./actions";

export function InitiateClearanceForm({ employees, initialEmployeeId, today }: { employees: (Option & { hint?: string })[]; initialEmployeeId?: string; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState(initialEmployeeId && employees.some((e) => e.value === initialEmployeeId) ? initialEmployeeId : "");
  const [lastWorkingDay, setLastWorkingDay] = useState(today);
  const [notes, setNotes] = useState("");
  const [cancelRequests, setCancelRequests] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    startTransition(async () => {
      const r = await initiateClearance({ employeeId, lastWorkingDay, notes, cancelOpenRequests: cancelRequests });
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, m]) => [k, m[0]!])));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      router.push(`/clearance/${r.data.id}`);
    });
  }

  return (
    <Card>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Leaving employee" error={errors.employeeId} className="sm:col-span-2">
          <ComboboxField value={employeeId} onChange={setEmployeeId} options={employees} placeholder="Search by name or employee ID" invalid={!!errors.employeeId} />
        </Field>
        <Field label="Last working day" htmlFor="lwd" error={errors.lastWorkingDay}>
          <Input id="lwd" type="date" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} />
        </Field>
        <div className="flex items-end pb-2">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox checked={cancelRequests} onCheckedChange={(v) => setCancelRequests(v === true)} className="mt-0.5" />
            Cancel their open asset requests
          </label>
        </div>
        <Field label="Notes (optional)" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Resignation accepted 1 Nov; laptop to be collected by IT on last day" />
        </Field>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Every asset the employee holds is added to the clearance, and they&apos;re marked as on notice. New assets can&apos;t be assigned to them until the clearance is closed.
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !employeeId}>
            {pending && <Loader2 className="animate-spin" />}
            Start clearance
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClearanceItemActions({ itemId, assetLabel, returnAssignmentId }: { itemId: string; assetLabel: string; returnAssignmentId?: string }) {
  const [mode, setMode] = useState<"MISSING" | "WAIVED" | null>(null);
  const [notes, setNotes] = useState("");
  const [recovery, setRecovery] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    if (!mode) return;
    startTransition(async () => {
      const r = await resolveClearanceItem({ itemId, resolution: mode, notes, recoveryAmount: recovery });
      if (r.ok) {
        toast.success(r.message);
        setMode(null);
        setNotes("");
        setRecovery("");
      } else toast.error(r.fieldErrors?.notes?.[0] ?? r.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {returnAssignmentId && (
        <Link href={`/assignments/${returnAssignmentId}/return`} className={buttonVariants({ size: "sm" })}>
          <Undo2 />
          Process return
        </Link>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Other outcomes for ${assetLabel}`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={() => setMode("MISSING")}>
            <SearchX />
            Mark as missing
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("WAIVED")}>
            <Ban />
            Write off / let them keep it
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "MISSING" ? "Mark as missing" : "Write off asset"}</DialogTitle>
            <DialogDescription>
              {assetLabel}.{" "}
              {mode === "MISSING"
                ? "The asset will be marked Lost and the assignment closed."
                : "The asset will be marked Disposed and the assignment closed (e.g. damaged beyond use, or kept by the employee with approval)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="What happened?" htmlFor="res-notes">
              <Textarea id="res-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Field label="Amount to recover, ₹ (optional)" htmlFor="res-amount" hint="Recorded on the clearance and in the returns report.">
              <Input id="res-amount" inputMode="decimal" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="0" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} disabled={pending}>
              Back
            </Button>
            <Button variant="destructive" onClick={save} disabled={pending || notes.trim().length < 3}>
              {pending && <Loader2 className="animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ClearanceControls({ id, employeeName, pendingCount }: { id: string; employeeName: string; pendingCount: number }) {
  const [mode, setMode] = useState<"complete" | "cancel" | null>(null);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = mode === "complete" ? await completeClearance({ id, notes: text }) : await cancelClearance({ id, reason: text });
      if (r.ok) {
        toast.success(r.message);
        setMode(null);
      } else toast.error(r.fieldErrors ? Object.values(r.fieldErrors)[0]![0]! : r.error);
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setMode("cancel")}>
        Cancel clearance
      </Button>
      <Button onClick={() => setMode("complete")} disabled={pendingCount > 0} title={pendingCount ? `${pendingCount} asset(s) still pending` : undefined}>
        <CheckCircle2 />
        Complete clearance
      </Button>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "complete" ? "Complete exit clearance" : "Cancel exit clearance"}</DialogTitle>
            <DialogDescription>
              {mode === "complete"
                ? `${employeeName} will be marked as exited, and any EAMS login linked to them is deactivated.`
                : `${employeeName} goes back to Active, for example if the resignation was withdrawn.`}
            </DialogDescription>
          </DialogHeader>
          <Field label={mode === "complete" ? "Closing note (optional)" : "Reason"} htmlFor="ctl-text">
            <Textarea id="ctl-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} disabled={pending}>
              Back
            </Button>
            <Button variant={mode === "cancel" ? "destructive" : "default"} onClick={save} disabled={pending || (mode === "cancel" && text.trim().length < 3)}>
              {pending && <Loader2 className="animate-spin" />}
              {mode === "complete" ? "Complete" : "Cancel clearance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
