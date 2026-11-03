import Link from "next/link";
import { differenceInCalendarDays, format } from "date-fns";
import { LogOut, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination, SortableHead } from "@/components/shared/list-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { todayUtc } from "@/lib/dates";
import { hrefWith } from "@/lib/list-params";
import { CLEARANCE_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { CLEARANCE_VIEWS, clearanceFilters, listClearances, type ClearanceView } from "@/features/clearance/queries";

export const metadata = { title: "Exit Clearance" };

const PATH = "/clearance";
const VIEW_LABEL: Record<ClearanceView, string> = { open: "Open", completed: "Completed", cancelled: "Cancelled", all: "All" };

export default async function ClearancePage({ searchParams }: PageProps<"/clearance">) {
  const user = await requirePagePermission("clearance:read");
  const sp = await searchParams;
  const f = clearanceFilters(sp);
  const { rows, total, counts } = await listClearances(f);
  const today = todayUtc();
  const sortProps = { sort: f.sort, dir: f.dir, pathname: PATH, sp };

  return (
    <>
      <PageHeader
        title="Exit clearance"
        description="Collect company assets from leaving employees before their last working day."
        actions={
          hasPermission(user, "clearance:manage") && (
            <Link href="/clearance/new" className={buttonVariants()}>
              <Plus />
              Start clearance
            </Link>
          )
        }
      />

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Clearance views">
        {CLEARANCE_VIEWS.map((v) => (
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

      <ListToolbar searchPlaceholder="Search employee…" />

      {total === 0 && !f.q ? (
        <EmptyState icon={LogOut} title={f.view === "open" ? "No one is leaving right now" : `No ${VIEW_LABEL[f.view].toLowerCase()} clearances`} description={f.view === "open" ? "Start a clearance when an employee resigns or is leaving." : undefined} />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Employee</TableHead>
                  <SortableHead label="Last working day" column="lastWorkingDay" {...sortProps} />
                  <TableHead>Assets</TableHead>
                  <TableHead>Status</TableHead>
                  <SortableHead label="Started" column="createdAt" className="hidden lg:table-cell" {...sortProps} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No clearances match.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((c) => {
                  const done = c.items.filter((i) => i.resolution !== "PENDING").length;
                  const open = c.status === "INITIATED" || c.status === "IN_PROGRESS";
                  const days = differenceInCalendarDays(c.lastWorkingDay, today);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="pl-4">
                        <Link href={`/clearance/${c.id}`} className="font-medium hover:text-primary hover:underline">
                          {c.employee.fullName}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {c.employee.employeeCode}
                          {c.employee.department && ` · ${c.employee.department.name}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(c.lastWorkingDay, "d MMM yyyy")}
                        {open && (
                          <div className={cn("text-xs", days < 0 ? "font-medium text-destructive" : days <= 3 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                            {days < 0 ? `${-days} day(s) ago` : days === 0 ? "Today" : `in ${days} day(s)`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${c.items.length ? (done / c.items.length) * 100 : 100}%` }} />
                          </div>
                          <span className="text-sm tabular-nums">
                            {done}/{c.items.length}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge meta={CLEARANCE_STATUS} value={c.status} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {format(c.createdAt, "d MMM yyyy")}
                        <div className="text-xs">by {c.initiatedBy.name}</div>
                      </TableCell>
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
