"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { markNotificationsRead } from "./actions";

export type BellItem = { id: string; title: string; message: string; link: string | null; readAt: Date | null; createdAt: Date };

export function NotificationBell({ items, unread }: { items: BellItem[]; unread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function openItem(n: BellItem) {
    setOpen(false);
    startTransition(async () => {
      if (!n.readAt) await markNotificationsRead({ ids: [n.id] });
      if (n.link) router.push(n.link);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-sm" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} />}
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] max-w-[calc(100vw-2rem)] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={() => startTransition(async () => void (await markNotificationsRead({})))}>
              <CheckCheck />
              Mark all read
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)} className="flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">{n.message}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setOpen(false);
              router.push("/notifications");
            }}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
