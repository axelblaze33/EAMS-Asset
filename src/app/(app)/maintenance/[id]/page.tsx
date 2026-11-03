import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryIcon } from "@/components/shared/category-icon";
import { DetailList } from "@/components/shared/detail-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { toDateInput, todayUtc } from "@/lib/dates";
import { formatMoney } from "@/lib/depreciation";
import { ASSET_STATUS, MAINTENANCE_STATUS, PRIORITY } from "@/lib/labels";
import { isStorageConfigured } from "@/lib/storage";
import { getTicket, getTicketOptions } from "@/features/maintenance/queries";
import { TicketUpdate } from "@/features/maintenance/ticket-update";
import { HandoverFiles } from "@/features/assignments/handover-files";

export const metadata = { title: "Maintenance Ticket" };

const d = (date: Date | null | undefined) => (date ? format(date, "d MMM yyyy") : "—");

export default async function TicketPage({ params }: PageProps<"/maintenance/[id]">) {
  const user = await requirePagePermission("maintenance:read");
  const { id } = await params;
  const [t, opts] = await Promise.all([getTicket(id), getTicketOptions()]);
  if (!t) notFound();

  const open = ["OPEN", "IN_PROGRESS", "PENDING_PARTS"].includes(t.status);
  const canManage = hasPermission(user, "maintenance:manage") && open;
  const underWarranty = t.asset.warrantyExpiry && t.asset.warrantyExpiry >= todayUtc();
  const holder = t.asset.assignments[0]?.employee;
  const days = differenceInCalendarDays(t.completedAt ?? new Date(), t.startedAt ?? t.createdAt);

  return (
    <>
      <PageHeader title={t.ticketCode} description={t.issue} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {underWarranty && open && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p>
                Under warranty until {d(t.asset.warrantyExpiry)}
                {t.asset.vendor && <> with {t.asset.vendor.name}</>}. Check with the vendor before paying for a repair.
              </p>
            </div>
          )}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4">
              <CategoryIcon name={t.asset.category.name} className="size-10" />
              <div className="min-w-0 flex-1">
                <Link href={`/assets/${t.asset.id}`} className="font-medium hover:underline">
                  {t.asset.name}
                </Link>
                <div className="text-sm text-muted-foreground">
                  <span className="font-mono">{t.asset.assetCode}</span>
                  {t.asset.serialNumber && ` · S/N ${t.asset.serialNumber}`}
                </div>
              </div>
              <div className="text-right text-sm">
                <StatusBadge meta={ASSET_STATUS} value={t.asset.status} />
                {holder && <div className="mt-1 text-muted-foreground">With {holder.fullName}</div>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Ticket
                <StatusBadge meta={MAINTENANCE_STATUS} value={t.status} />
                <StatusBadge meta={PRIORITY} value={t.priority} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  ["Issue", <span key="i" className="whitespace-pre-line">{t.issue}</span>],
                  ["Opened", `${d(t.createdAt)}${t.reportedBy ? ` by ${t.reportedBy.name}` : ""}`],
                  ["Assigned to", t.assignee?.name ?? "Unassigned"],
                  ["Service provider", t.vendor?.name],
                  ["Started", d(t.startedAt)],
                  ["Completed", d(t.completedAt)],
                  ["Duration", t.startedAt || !open ? `${days} day${days === 1 ? "" : "s"}` : "Not started"],
                  ["Cost", t.cost ? formatMoney(Number(t.cost)) : "—"],
                  ["Resolution", t.resolutionNotes && <span key="r" className="whitespace-pre-line">{t.resolutionNotes}</span>],
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoices and documents</CardTitle>
            </CardHeader>
            <CardContent>
              <HandoverFiles assignmentId="" documents={t.documents} canAttach={false} storageReady={isStorageConfigured()} emptyText="No documents attached." />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>{canManage ? "Update ticket" : "Closed"}</CardTitle>
            <CardDescription>
              {canManage
                ? "Move the ticket along, record the cost and attach invoices."
                : open
                  ? "You can view this ticket but not change it."
                  : `This ticket was ${t.status === "COMPLETED" ? "completed" : "cancelled"}. Open a new ticket for further work.`}
            </CardDescription>
          </CardHeader>
          {canManage && (
            <CardContent>
              <TicketUpdate
                ticket={{
                  id: t.id,
                  status: t.status,
                  priority: t.priority,
                  assigneeId: t.assigneeId,
                  vendorId: t.vendorId,
                  cost: t.cost?.toString() ?? "",
                  startedAt: toDateInput(t.startedAt),
                  completedAt: toDateInput(t.completedAt),
                  resolutionNotes: t.resolutionNotes ?? "",
                  assetUnderMaintenance: t.asset.status === "UNDER_MAINTENANCE",
                }}
                assignees={opts.assignees}
                vendors={opts.vendors}
                today={toDateInput(todayUtc())}
                storageReady={isStorageConfigured()}
              />
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}
