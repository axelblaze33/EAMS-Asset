import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { BellOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/list-controls";
import { hasPermission, requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { hrefWith, param, parseList } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { MarkAllRead, OpenNotification, RunRemindersButton } from "@/features/notifications/notification-list-actions";

export const metadata = { title: "Notifications" };

const PATH = "/notifications";

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const user = await requireUser();
  const sp = await searchParams;
  const f = parseList(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultDir: "desc" });
  const unreadOnly = param(sp, "show") === "unread";
  const where = { userId: user.id, ...(unreadOnly && { readAt: null }) };
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: f.skip, take: f.pageSize }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Reminders and updates for you. Warranty, overdue-return and clearance reminders are checked every morning."
        actions={
          <>
            {hasPermission(user, "settings:manage") && <RunRemindersButton />}
            <MarkAllRead disabled={unread === 0} />
          </>
        }
      />
      <nav className="flex gap-1 border-b" aria-label="Notification filter">
        {[
          ["all", "All", undefined],
          ["unread", `Unread (${unread})`, "unread"],
        ].map(([key, label, value]) => (
          <Link
            key={key}
            href={hrefWith(PATH, sp, { show: value, page: undefined })}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              (unreadOnly ? "unread" : "all") === key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={BellOff} title={unreadOnly ? "No unread notifications" : "No notifications yet"} />
      ) : (
        <div className="space-y-3">
          <ul className="divide-y rounded-xl border bg-card p-1 shadow-xs">
            {rows.map((n) => (
              <li key={n.id}>
                <OpenNotification id={n.id} href={n.link} unread={!n.readAt}>
                  <div className="flex gap-3">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <span className={cn("text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                        <time className="text-xs text-muted-foreground" dateTime={n.createdAt.toISOString()} title={format(n.createdAt, "d MMM yyyy, HH:mm")}>
                          {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                        </time>
                      </div>
                      <p className="text-sm text-muted-foreground">{n.message}</p>
                    </div>
                  </div>
                </OpenNotification>
              </li>
            ))}
          </ul>
          <Pagination total={total} page={f.page} pageSize={f.pageSize} pathname={PATH} sp={sp} />
        </div>
      )}
    </>
  );
}
