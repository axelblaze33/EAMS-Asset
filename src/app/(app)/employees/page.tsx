import Link from "next/link";
import { format } from "date-fns";
import { Plus, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ExportMenu } from "@/components/shared/export-menu";
import { ImportDialog } from "@/components/shared/import-dialog";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination, SortableHead } from "@/components/shared/list-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { EMPLOYMENT_STATUS } from "@/lib/labels";
import { getOrgOptions } from "@/features/master-data/queries";
import { employeeFilters, listEmployees } from "@/features/employees/queries";
import { importEmployees } from "@/features/employees/import";

export const metadata = { title: "Employees" };

const PATH = "/employees";

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const user = await requirePagePermission("employee:read");
  const sp = await searchParams;
  const f = employeeFilters(sp);
  const [{ rows, total }, org] = await Promise.all([listEmployees(f), getOrgOptions()]);
  const sortProps = { sort: f.sort, dir: f.dir, pathname: PATH, sp };
  const filtered = Boolean(f.q || f.department || f.branch || f.status);

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone who can be assigned company assets."
        actions={
          <>
            {hasPermission(user, "employee:import") && (
              <ImportDialog
                title="Import employees"
                description="Rows are matched on Employee ID: existing employees are updated, new IDs are added. Departments, designations and branches must already exist."
                templateHref="/api/templates/employees"
                action={importEmployees}
              />
            )}
            {hasPermission(user, "employee:create") && (
              <Link href="/employees/new" className={buttonVariants()}>
                <Plus />
                Add employee
              </Link>
            )}
          </>
        }
      />

      <ListToolbar
        searchPlaceholder="Search name, ID, email, phone…"
        filters={[
          { key: "department", label: "Departments", options: org.departments },
          { key: "branch", label: "Branches", options: org.branches },
          { key: "status", label: "Statuses", options: Object.entries(EMPLOYMENT_STATUS).map(([value, m]) => ({ value, label: m.label })) },
        ]}
      >
        <ExportMenu endpoint="/api/export/employees" />
      </ListToolbar>

      {total === 0 && !filtered ? (
        <EmptyState icon={Users} title="No employees yet" description="Add employees one by one or import them from Excel." />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Employee" column="name" className="pl-4" {...sortProps} />
                  <SortableHead label="ID" column="code" {...sortProps} />
                  <SortableHead label="Department" column="department" className="hidden md:table-cell" {...sortProps} />
                  <TableHead className="hidden lg:table-cell">Branch</TableHead>
                  <SortableHead label="Joined" column="joiningDate" className="hidden xl:table-cell" {...sortProps} />
                  <TableHead className="text-right">Assets</TableHead>
                  <SortableHead label="Status" column="status" {...sortProps} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No employees match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((e) => (
                  <TableRow key={e.id} className="group">
                    <TableCell className="pl-4">
                      <Link href={`/employees/${e.id}`} className="font-medium hover:underline">
                        {e.fullName}
                      </Link>
                      <div className="text-xs text-muted-foreground">{e.designation?.title ?? e.email}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.employeeCode}</TableCell>
                    <TableCell className="hidden md:table-cell">{e.department?.name ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{e.branch?.name ?? "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">
                      {e.joiningDate ? format(e.joiningDate, "d MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e._count.assignments || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge meta={EMPLOYMENT_STATUS} value={e.employmentStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination total={total} page={f.page} pageSize={f.pageSize} pathname={PATH} sp={sp} />
        </div>
      )}
    </>
  );
}
