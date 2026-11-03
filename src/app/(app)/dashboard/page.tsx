import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Archive,
  CalendarClock,
  FileSignature,
  ShieldAlert,
  Boxes,
  CircleAlert,
  ClipboardList,
  PackageCheck,
  PackageOpen,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { AttentionPanel } from "@/features/dashboard/attention-panel";
import { PageHeader } from "@/components/layout/page-header";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { ASSET_STATUS, type Tone } from "@/lib/labels";
import { getOrgOptions } from "@/features/master-data/queries";
import {
  RANGES,
  dashboardFilters,
  getAttention,
  getDistributions,
  getKpis,
  getRecentActivity,
  getTrends,
} from "@/features/dashboard/queries";
import { MovementChart, ProcurementChart, RankedBars } from "@/features/dashboard/charts";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requirePagePermission("dashboard:read");
  const f = dashboardFilters(await searchParams);
  const [kpis, dist, trends, activity, org, attention] = await Promise.all([
    getKpis(f),
    getDistributions(f),
    getTrends(f),
    getRecentActivity(f),
    getOrgOptions(),
    getAttention(f),
  ]);
  const canAssets = hasPermission(user, "asset:read");
  const deptQs = f.department ? `&department=${f.department}` : "";

  const assetHref = (status?: string) =>
    canAssets ? (status ? `/assets?status=${status}${deptQs}` : `/assets${deptQs.replace("&", "?")}`) : undefined;
  const cards: { label: string; value: number; icon: LucideIcon; tone: Tone | "brand"; href?: string; hint?: string }[] = [
    { label: "Total assets", value: kpis.total, icon: Boxes, tone: "brand", href: assetHref(), hint: kpis.lost ? `${kpis.lost} marked lost` : undefined },
    { label: "Available", value: kpis.available, icon: PackageOpen, tone: "success", href: assetHref("AVAILABLE") },
    { label: "Assigned", value: kpis.assigned, icon: PackageCheck, tone: "info", href: assetHref("ASSIGNED") },
    { label: "Under maintenance", value: kpis.maintenance, icon: Wrench, tone: "warning", href: assetHref("UNDER_MAINTENANCE") },
    { label: "Damaged", value: kpis.damaged, icon: CircleAlert, tone: "danger", href: assetHref("DAMAGED") },
    { label: "Retired / disposed", value: kpis.retired, icon: Archive, tone: "muted", href: assetHref("RETIRED") },
    { label: "Active employees", value: kpis.employees, icon: Users, tone: "brand", href: hasPermission(user, "employee:read") ? `/employees?status=ACTIVE${deptQs}` : undefined },
    { label: "Pending requests", value: kpis.pendingRequests, icon: ClipboardList, tone: "warning", href: hasPermission(user, "request:read") ? "/requests" : undefined },
  ];

  const rangeLabel = RANGES[f.range].toLowerCase();

  return (
    <>
      <PageHeader title={`Welcome back, ${user.name.split(" ")[0]}`} description="A live overview of company assets and their allocation." />

      <ListToolbar
        showSearch={false}
        filters={[
          { key: "department", label: "Departments", options: org.departments },
          {
            key: "range",
            label: "Time range",
            allLabel: RANGES["12"],
            options: Object.entries(RANGES)
              .filter(([k]) => k !== "12")
              .map(([value, label]) => ({ value, label })),
          },
        ]}
      />
      <p className="-mt-3 text-xs text-muted-foreground">
        Charts of trends and recent activity cover the {rangeLabel}. Counts and distributions show the current state.
      </p>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <AttentionPanel
        items={[
          { show: hasPermission(user, "assignment:read"), count: attention.overdue, label: "overdue returns", href: "/assignments?view=overdue", icon: CalendarClock, tone: "danger" },
          { show: hasPermission(user, "assignment:read"), count: attention.unacknowledged, label: "handovers not acknowledged", href: "/assignments?view=pending", icon: FileSignature, tone: "warning" },
          { show: hasPermission(user, "request:read"), count: attention.pendingRequests, label: "requests awaiting approval", href: "/requests", icon: ClipboardList, tone: "warning" },
          { show: hasPermission(user, "request:read"), count: attention.approvedRequests, label: "approved requests to fulfil", href: "/requests?view=approved", icon: PackageCheck, tone: "info" },
          { show: hasPermission(user, "maintenance:read"), count: attention.staleTickets, label: "repairs open over 14 days", href: "/maintenance", icon: Wrench, tone: "warning" },
          { show: canAssets, count: attention.warranties, label: "warranties expiring in 30 days", href: "/assets?warranty=30", icon: ShieldAlert, tone: "info" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assignments and returns</CardTitle>
            <CardDescription>Assets handed over and returned each month</CardDescription>
          </CardHeader>
          <CardContent>
            <MovementChart data={trends} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Procurement</CardTitle>
            <CardDescription>Purchase spend by month of purchase date</CardDescription>
          </CardHeader>
          <CardContent>
            <ProcurementChart data={trends} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
            <CardDescription>All assets in the inventory</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars data={dist.byCategory} label="Assets" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
            <CardDescription>Where every asset is right now</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars data={dist.byStatus.map((s) => ({ label: ASSET_STATUS[s.status].label, value: s.value }))} label="Assets" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Allocation by department</CardTitle>
            <CardDescription>Assets currently held by each department&apos;s employees</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars data={dist.byDepartment} label="Assigned assets" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Additions, assignments, returns, maintenance and status changes</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity in the {rangeLabel}.</p>
          ) : (
            <ul className="divide-y">
              {activity.map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    {log.entityType === "Asset" && canAssets ? (
                      <Link href={`/assets/${log.entityId}`} className="text-sm hover:underline">
                        {log.summary ?? log.action}
                      </Link>
                    ) : (
                      <p className="text-sm">{log.summary ?? log.action}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{log.actor?.name ?? "System"}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={log.createdAt.toISOString()}>
                    {formatDistanceToNow(log.createdAt, { addSuffix: true })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
