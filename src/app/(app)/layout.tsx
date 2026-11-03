import { Suspense } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { CommandMenu, ThemeToggle } from "@/components/layout/command-menu";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { NotificationBell } from "@/features/notifications/notification-bell";

// The layout itself stays static so the shell renders instantly; anything that
// reads the session streams in behind a Suspense boundary (Cache Components).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Suspense fallback={<SidebarFallback />}>
        <SessionSidebar />
      </Suspense>
      {/* min-w-0 lets wide tables scroll inside their card instead of widening the page. */}
      <SidebarInset className="min-w-0">
        <header data-app-header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md md:px-6">
          <SidebarTrigger className="-ml-1.5" />
          <Separator orientation="vertical" className="mr-1 h-4 data-vertical:self-center" />
          <Suspense fallback={null}>
            <Breadcrumbs />
          </Suspense>
          <div className="ml-auto flex items-center gap-1.5">
            <Suspense fallback={<Skeleton className="h-8 w-9 sm:w-56 lg:w-64" />}>
              <SessionCommandMenu />
            </Suspense>
            <Suspense fallback={<Skeleton className="size-8" />}>
              <SessionBell />
            </Suspense>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 space-y-6 px-4 py-6 md:px-6 lg:px-8 lg:py-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

async function SessionSidebar() {
  const user = await requireUser();
  return (
    <AppSidebar
      user={{ name: user.name, email: user.email, roleName: user.roleName }}
      permissions={user.permissions}
    />
  );
}

async function SessionCommandMenu() {
  const user = await requireUser();
  return <CommandMenu permissions={user.permissions} />;
}

async function SessionBell() {
  const user = await requireUser();
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, title: true, message: true, link: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return <NotificationBell items={items} unread={unread} />;
}

function SidebarFallback() {
  return (
    <div className="hidden w-(--sidebar-width) shrink-0 flex-col gap-3 border-r bg-sidebar p-4 md:flex">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}
