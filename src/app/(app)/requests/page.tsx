import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ClipboardList, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryIcon } from "@/components/shared/category-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination, SortableHead } from "@/components/shared/list-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasAnyPermission, hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { hrefWith } from "@/lib/list-params";
import { PRIORITY, REQUEST_STATUS, REQUEST_TYPE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getOrgOptions } from "@/features/master-data/queries";
import { REQUEST_VIEWS, listRequests, requestFilters, type RequestView } from "@/features/requests/queries";
import { RequestActions } from "@/features/requests/request-actions";

export const metadata = { title: "Asset Requests" };

const PATH = "/requests";
const VIEW_LABEL: Record<RequestView, string> = { pending: "Pending", approved: "Approved", fulfilled: "Fulfilled", closed: "Rejected / cancelled", all: "All" };

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const user = await requirePagePermission("request:read");
  const sp = await searchParams;
  const f = requestFilters(sp);
  const [{ rows, total, counts, stock }, org] = await Promise.all([listRequests(f), getOrgOptions()]);
  const sortProps = { sort: f.sort, dir: f.dir, pathname: PATH, sp };
  const canApprove = hasPermission(user, "request:approve");
  const canCancel = hasAnyPermission(user, "request:create", "request:approve");
  const canAssign = hasPermission(user, "assignment:create");

  return (
    <>
      <PageHeader
        title="Asset requests"
        description="Equipment requested for employees, from approval to handover."
        actions={
          hasPermission(user, "request:create") && (
            <Link href="/requests/new" className={buttonVariants()}>
              <Plus />
              Log request
            </Link>
          )
        }
      />

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Request views">
        {REQUEST_VIEWS.map((v) => (
          <Link
            key={v}
            href={hrefWith(PATH, sp, { view: v === "pending" ? undefined : v, page: undefined })}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              f.view === v ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={f.view === v ? "page" : undefined}
          >
            {VIEW_LABEL[v]}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums",
                v === "pending" && counts[v] > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground",
              )}
            >
              {counts[v]}
            </span>
          </Link>
        ))}
      </nav>

      <ListToolbar
        searchPlaceholder="Search request, employee or reason…"
        filters={[
          { key: "category", label: "Categories", options: org.categories },
          { key: "department", label: "Departments", options: org.departments },
        ]}
      />

      {total === 0 && !f.q && !f.category && !f.department ? (
        <EmptyState icon={ClipboardList} title={`No ${VIEW_LABEL[f.view].toLowerCase()} requests`} description={f.view === "pending" ? "Requests you log for employees wait here for approval." : undefined} />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Request</TableHead>
                  <TableHead>Employee</TableHead>
                  <SortableHead label="Priority" column="priority" {...sortProps} />
                  <TableHead>Status</TableHead>
                  <SortableHead label="Logged" column="createdAt" className="hidden lg:table-cell" {...sortProps} />
                  <TableHead className="w-48" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No requests match.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const inStock = stock[r.category.id] ?? 0;
                  return (
                    <TableRow key={r.id} className="align-top">
                      <TableCell className="max-w-80 pl-4">
                        <div className="flex items-start gap-3">
                          <CategoryIcon name={r.category.name} />
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-medium">
                              {r.category.name} <span className="font-normal text-muted-foreground">· {REQUEST_TYPE[r.type].label}</span>
                            </div>
                            <div className="line-clamp-2 text-sm whitespace-normal text-muted-foreground">{r.reason}</div>
                            <div className="font-mono text-xs text-muted-foreground">{r.requestCode}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/employees/${r.employee.id}`} className="hover:underline">
                          {r.employee.fullName}
                        </Link>
                        <div className="text-xs text-muted-foreground">{r.employee.department?.name ?? r.employee.employeeCode}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge meta={PRIORITY} value={r.priority} />
                      </TableCell>
                      <TableCell className="space-y-1">
                        <StatusBadge meta={REQUEST_STATUS} value={r.status} />
                        {r.assignment && (
                          <Link href={`/assets/${r.assignment.asset.id}`} className="block font-mono text-xs text-primary hover:underline">
                            {r.assignment.asset.assetCode}
                          </Link>
                        )}
                        {(r.status === "PENDING" || r.status === "APPROVED") && (
                          <div className={cn("text-xs", inStock ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400")}>
                            {inStock ? `${inStock} in stock` : "None in stock"}
                          </div>
                        )}
                        {r.reviewedBy && r.status !== "PENDING" && (
                          <div className="max-w-48 text-xs whitespace-normal text-muted-foreground">
                            by {r.reviewedBy.name}
                            {r.reviewNotes && `: ${r.reviewNotes}`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div title={format(r.createdAt, "d MMM yyyy, HH:mm")}>{formatDistanceToNow(r.createdAt, { addSuffix: true })}</div>
                        {r.requestedBy && <div className="text-xs text-muted-foreground">by {r.requestedBy.name}</div>}
                      </TableCell>
                      <TableCell className="pr-4">
                        <RequestActions
                          id={r.id}
                          code={r.requestCode}
                          summary={`${r.category.name} for ${r.employee.fullName}`}
                          status={r.status}
                          canApprove={canApprove}
                          canCancel={canCancel}
                          canAssign={canAssign}
                          employeeId={r.employee.id}
                        />
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
