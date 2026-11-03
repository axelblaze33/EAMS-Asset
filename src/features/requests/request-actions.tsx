"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, MoreHorizontal, PackagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/form-fields";
import { cancelRequest, reviewRequest } from "./actions";

type Mode = "APPROVE" | "REJECT" | "CANCEL";

const COPY: Record<Mode, { title: string; button: string; notes: string; required: boolean }> = {
  APPROVE: { title: "Approve request", button: "Approve", notes: "Note (optional)", required: false },
  REJECT: { title: "Reject request", button: "Reject", notes: "Reason", required: true },
  CANCEL: { title: "Cancel request", button: "Cancel request", notes: "Reason (optional)", required: false },
};

export function RequestActions({
  id,
  code,
  summary,
  status,
  canApprove,
  canCancel,
  canAssign,
  employeeId,
}: {
  id: string;
  code: string;
  summary: string;
  status: string;
  canApprove: boolean;
  canCancel: boolean;
  canAssign: boolean;
  employeeId: string;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!mode) return;
    if (COPY[mode].required && !notes.trim()) {
      toast.error("Give a reason for rejecting");
      return;
    }
    startTransition(async () => {
      const r = mode === "CANCEL" ? await cancelRequest({ id, notes }) : await reviewRequest({ id, decision: mode, notes });
      if (r.ok) {
        toast.success(r.message);
        setMode(null);
        setNotes("");
      } else toast.error(r.error);
    });
  }

  const open = status === "PENDING" || status === "APPROVED";
  if (!open) return null;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status === "PENDING" && canApprove && (
        <>
          <Button size="sm" variant="outline" onClick={() => setMode("REJECT")} aria-label={`Reject ${code}`}>
            <X />
            <span className="hidden sm:inline">Reject</span>
          </Button>
          <Button size="sm" onClick={() => setMode("APPROVE")} aria-label={`Approve ${code}`}>
            <Check />
            <span className="hidden sm:inline">Approve</span>
          </Button>
        </>
      )}
      {status === "APPROVED" && canAssign && (
        <Link href={`/assignments/new?request=${id}&employee=${employeeId}`} className={buttonVariants({ size: "sm" })}>
          <PackagePlus />
          Fulfil
        </Link>
      )}
      {canCancel && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${code}`} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem variant="destructive" onClick={() => setMode("CANCEL")}>
              <X />
              Cancel request
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          {mode && (
            <>
              <DialogHeader>
                <DialogTitle>{COPY[mode].title}</DialogTitle>
                <DialogDescription>
                  {code}: {summary}
                </DialogDescription>
              </DialogHeader>
              <Field label={COPY[mode].notes} htmlFor="review-notes">
                <Textarea id="review-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMode(null)} disabled={pending}>
                  Back
                </Button>
                <Button variant={mode === "APPROVE" ? "default" : "destructive"} onClick={submit} disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  {COPY[mode].button}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
