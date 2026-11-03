import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { param } from "@/lib/list-params";
import { getOrgOptions } from "@/features/master-data/queries";
import { RequestForm } from "@/features/requests/request-form";

export const metadata = { title: "Log Asset Request" };

export default async function NewRequestPage({ searchParams }: PageProps<"/requests/new">) {
  await requirePagePermission("request:create");
  const sp = await searchParams;
  const [employees, org] = await Promise.all([
    db.employee.findMany({
      where: { deletedAt: null, employmentStatus: { not: "EXITED" } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } },
    }),
    getOrgOptions(),
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Log asset request" description="Record a request for equipment on behalf of an employee. An IT administrator approves it." />
      <RequestForm
        initialEmployeeId={param(sp, "employee")}
        categories={org.categories}
        employees={employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})`, hint: e.department?.name }))}
      />
    </div>
  );
}
