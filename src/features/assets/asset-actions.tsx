"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { setAssetArchived } from "./actions";

export function DeleteAssetButton({ id, label, disabledReason }: { id: string; label: string; disabledReason?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await setAssetArchived({ id, archived: true });
      if (result.ok) {
        toast.success(result.message);
        router.push("/assets");
      } else {
        toast.error(result.error);
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => (disabledReason ? toast.error(disabledReason) : setOpen(true))}
      >
        <Trash2 />
        Delete
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The asset is removed from the inventory and pickers. Its assignment, maintenance and audit history are kept, and you can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirm} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Delete asset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function RestoreAssetButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setAssetArchived({ id, archived: false });
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
      Restore
    </Button>
  );
}
