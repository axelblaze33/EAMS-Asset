"use client";

import { useTransition } from "react";
import { BellRing, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markNotificationsRead, runRemindersNow } from "./actions";

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" disabled={disabled || pending} onClick={() => startTransition(async () => void (await markNotificationsRead({})))}>
      {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
      Mark all read
    </Button>
  );
}

export function RunRemindersButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await runRemindersNow();
          if (!r.ok) return void toast.error(r.error);
          const c = r.data;
          toast.success("Reminder checks complete", {
            description: `Warranties ${c.warranty}, due soon ${c.dueSoon}, overdue ${c.overdue}, unacknowledged ${c.unacknowledged}, clearances ${c.clearance}, long repairs ${c.staleRepairs}. Each is only notified once.`,
          });
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <BellRing />}
      Run reminder checks
    </Button>
  );
}

export function OpenNotification({ id, href, unread, children }: { id: string; href: string | null; unread: boolean; children: React.ReactNode }) {
  const [, startTransition] = useTransition();
  return (
    <a
      href={href ?? "#"}
      onClick={(e) => {
        if (!unread) return;
        e.preventDefault();
        startTransition(async () => {
          await markNotificationsRead({ ids: [id] });
          if (href) window.location.assign(href);
        });
      }}
      className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60"
    >
      {children}
    </a>
  );
}
