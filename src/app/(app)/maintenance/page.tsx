import Link from "next/link";
import { differenceInCalendarDays, format } from "date-fns";
import { Plus, Wrench } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryIcon } from "@/components/shared/category-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination, SortableHead } from "@/components/shared/list-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { formatMoney } from "@/lib/depreciation";
import { hrefWith } from "@/lib/list-params";
import { MAINTENANCE_STATUS, PRIORITY } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { TICKET_VIEWS, getTicketOptions, listTickets, ticketFilters, type TicketView } from "@/features/maintenance/queries";

export const metadata = { title: "Maintenance" };

const PATH = "/maintenance";
const VIEW_LABEL: Record<TicketView, string> = { open: "Open", completed: "Completed", cancelled: "Cancelled", all: "All" };

export default async function MaintenancePage({ searchParams }: PageProps<"/maintenance">) {
  const user = await requirePagePermission("maintenance:read");
  const sp = await searchParams;
  const f = ticketFilters(sp);
  const [{ rows, total, counts }, opts] = await Promise.all([listTickets(f), getTicketOptions()]);
  const sortProps = { sort: f.sort, dir: f.dir, pathname: PATH, sp };

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Repairs and servicing, with costs and history per asset."
        actions={
          hasPermission(user, "maintenance:manage") && (
            <Link href="/maintenance/new" className={buttonVariants()}>
              <Plus />
              New ticket
            </Link>
          )
        }
      />

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Ticket views">
        {TICKET_VIEWS.map((v) => (
          <Link
            key={v}
            href={hrefWith(PATH, sp, { view: v === "open" ? undefined : v, page: undefined })}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              f.view === v ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={f.view === v ? "page" : undefined}
          >
            {VIEW_LABEL[v]}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground tabular-nums">{counts[v]}</span>
          </Link>
        ))}
      </nav>

      <ListToolbar
        searchPlaceholder="Search ticket, asset or issue…"
        filters={[
          { key: "priority", label: "Priorities", options: Object.entries(PRIORITY).map(([value, m]) => ({ value, label: m.label })) },
          { key: "vendor", label: "Vendors", options: opts.vendors },
          { key: "assignee", label: "Assignees", options: opts.assignees },
        ]}
      />

      {total === 0 && !f.q && !f.priority && !f.vendor && !f.assignee ? (
        <EmptyState icon={Wrench} title={f.view === "open" ? "No open tickets" : `No ${VIEW_LABEL[f.view].toLowerCase()} tickets`} description={f.view === "open" ? "Everything is working. Open a ticket when an asset needs repair." : undefined} />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Ticket</TableHead>
                  <TableHead>Asset</TableHead>
                  <SortableHead label="Priority" column="priority" {...sortProps} />
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Assigned / vendor</TableHead>
                  <SortableHead label="Opened" column="createdAt" className="hidden md:table-cell" {...sortProps} />
                  <SortableHead label="Cost" column="cost" className="hidden text-right xl:table-cell" {...sortProps} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No tickets match.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((t) => {
                  const open = ["OPEN", "IN_PROGRESS", "PENDING_PARTS"].includes(t.status);
                  const age = differenceInCalendarDays(new Date(), t.createdAt);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="max-w-72 pl-4">
                        <Link href={`/maintenance/${t.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                          {t.ticketCode}
                        </Link>
                        <div className="truncate text-sm">{t.issue}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <CategoryIcon name={t.asset.category.name} />
                          <div className="min-w-0">
                            <Link href={`/assets/${t.asset.id}`} className="block truncate hover:underline">
                              {t.asset.name}
                            </Link>
                            <div className="font-mono text-xs text-muted-foreground">{t.asset.assetCode}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge meta={PRIORITY} value={t.priority} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge meta={MAINTENANCE_STATUS} value={t.status} />
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">
                        <div>{t.assignee?.name ?? <span className="text-muted-foreground">Unassigned</span>}</div>
                        {t.vendor && <div className="text-xs text-muted-foreground">{t.vendor.name}</div>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {format(t.createdAt, "d MMM yyyy")}
                        {open && <div className={cn("text-xs", age > 14 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{age} day{age === 1 ? "" : "s"} open</div>}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums xl:table-cell">{t.cost ? formatMoney(Number(t.cost)) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination total={total} page={f.page} pageSize={f.pageSize} pathname={PATH} sp={sp} />
        </div>
      )}
    </>
  );
}
