import Link from "next/link";
import { format } from "date-fns";
import { ArrowRightLeft, FileText, Plus, Undo2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryIcon } from "@/components/shared/category-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination, SortableHead } from "@/components/shared/list-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { todayUtc } from "@/lib/dates";
import { hrefWith } from "@/lib/list-params";
import { ACKNOWLEDGEMENT, ASSET_CONDITION } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getOrgOptions } from "@/features/master-data/queries";
import { ASSIGNMENT_VIEWS, assignmentFilters, listAssignments, type AssignmentView } from "@/features/assignments/queries";

export const metadata = { title: "Assignments" };

const PATH = "/assignments";
const VIEW_LABEL: Record<AssignmentView, string> = {
  active: "Active",
  pending: "Not acknowledged",
  overdue: "Overdue",
  returned: "Returned",
  all: "All",
};

export default async function AssignmentsPage({ searchParams }: PageProps<"/assignments">) {
  const user = await requirePagePermission("assignment:read");
  const sp = await searchParams;
  const f = assignmentFilters(sp);
  const [{ rows, total, counts }, org] = await Promise.all([listAssignments(f), getOrgOptions()]);
  const sortProps = { sort: f.sort, dir: f.dir, pathname: PATH, sp };
  const today = todayUtc();
  const canReturn = hasPermission(user, "assignment:return");

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Who holds which asset, handover acknowledgements and returns."
        actions={
          hasPermission(user, "assignment:create") && (
            <Link href="/assignments/new" className={buttonVariants()}>
              <Plus />
              Assign assets
            </Link>
          )
        }
      />

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Assignment views">
        {ASSIGNMENT_VIEWS.map((v) => (
          <Link
            key={v}
            href={hrefWith(PATH, sp, { view: v === "active" ? undefined : v, page: undefined })}
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
                v === "overdue" && counts[v] > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground",
              )}
            >
              {counts[v]}
            </span>
          </Link>
        ))}
      </nav>

      <ListToolbar searchPlaceholder="Search asset or employee…" filters={[{ key: "department", label: "Departments", options: org.departments }]} />

      {total === 0 && !f.q && !f.department ? (
        <EmptyState
          icon={ArrowRightLeft}
          title={f.view === "active" ? "No assets are assigned right now" : `Nothing in “${VIEW_LABEL[f.view]}”`}
          description={f.view === "active" ? "Assign an available asset to an employee to get started." : undefined}
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Asset</TableHead>
                  <SortableHead label="Employee" column="employee" {...sortProps} />
                  <SortableHead label="Assigned" column="assignedAt" className="hidden md:table-cell" {...sortProps} />
                  <SortableHead label="Return by" column="expectedReturnAt" className="hidden lg:table-cell" {...sortProps} />
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No assignments match.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((a) => {
                  const overdue = a.status === "ACTIVE" && a.expectedReturnAt && a.expectedReturnAt < today;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <CategoryIcon name={a.asset.category.name} />
                          <div className="min-w-0">
                            <Link href={`/assets/${a.asset.id}`} className="font-medium hover:text-primary hover:underline">
                              {a.asset.name}
                            </Link>
                            <div className="font-mono text-xs text-muted-foreground">{a.asset.assetCode}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/employees/${a.employee.id}`} className="hover:underline">
                          {a.employee.fullName}
                        </Link>
                        <div className="text-xs text-muted-foreground">{a.employee.department?.name ?? a.employee.employeeCode}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{format(a.assignedAt, "d MMM yyyy")}</TableCell>
                      <TableCell className={cn("hidden lg:table-cell", overdue ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                        {a.expectedReturnAt ? format(a.expectedReturnAt, "d MMM yyyy") : "—"}
                        {overdue && " · overdue"}
                      </TableCell>
                      <TableCell>
                        {a.status === "RETURNED" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            Returned {a.return && format(a.return.returnedAt, "d MMM")}
                            {a.return && <StatusBadge meta={ASSET_CONDITION} value={a.return.conditionAtReturn} />}
                          </span>
                        ) : (
                          <StatusBadge meta={ACKNOWLEDGEMENT} value={a.acknowledgement} />
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-1">
                          <Link
                            href={`/assignments/handover/${a.batchId ?? a.id}`}
                            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                            aria-label={`Handover details for ${a.asset.assetCode}`}
                            title="Handover"
                          >
                            <FileText />
                          </Link>
                          {canReturn && a.status === "ACTIVE" && (
                            <Link href={`/assignments/${a.id}/return`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                              <Undo2 />
                              Return
                            </Link>
                          )}
                        </div>
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
