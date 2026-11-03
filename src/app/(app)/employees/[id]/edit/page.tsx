import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/dates";
import { getOrgOptions } from "@/features/master-data/queries";
import { listManagerOptions } from "@/features/employees/queries";
import { EmployeeForm } from "@/features/employees/employee-form";

export const metadata = { title: "Edit Employee" };

export default async function EditEmployeePage({ params }: PageProps<"/employees/[id]/edit">) {
  await requirePagePermission("employee:update");
  const { id } = await params;
  const [employee, org, managers] = await Promise.all([
    db.employee.findFirst({ where: { id, deletedAt: null } }),
    getOrgOptions(),
    listManagerOptions(id),
  ]);
  if (!employee) notFound();

  // Keep archived departments etc. selectable if this employee still uses them.
  const keep = async <T extends { value: string }>(opts: T[], id: string | null, load: () => Promise<{ id: string; label: string } | null>) => {
    if (!id || opts.some((o) => o.value === id)) return opts;
    const row = await load();
    return row ? [...opts, { value: row.id, label: `${row.label} (archived)` } as unknown as T] : opts;
  };
  const [departments, designations, branches] = await Promise.all([
    keep(org.departments, employee.departmentId, async () => {
      const r = await db.department.findUnique({ where: { id: employee.departmentId! } });
      return r && { id: r.id, label: r.name };
    }),
    keep(org.designations, employee.designationId, async () => {
      const r = await db.designation.findUnique({ where: { id: employee.designationId! } });
      return r && { id: r.id, label: r.title };
    }),
    keep(org.branches, employee.branchId, async () => {
      const r = await db.branch.findUnique({ where: { id: employee.branchId! } });
      return r && { id: r.id, label: r.name };
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Edit ${employee.fullName}`} description={employee.employeeCode} />
      <EmployeeForm
        id={employee.id}
        defaults={{
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          email: employee.email,
          phone: employee.phone ?? "",
          departmentId: employee.departmentId ?? "",
          designationId: employee.designationId ?? "",
          branchId: employee.branchId ?? "",
          managerId: employee.managerId ?? "",
          joiningDate: toDateInput(employee.joiningDate),
          employmentStatus: employee.employmentStatus,
        }}
        options={{ departments, designations, branches, managers }}
      />
    </div>
  );
}
