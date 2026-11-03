import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { param } from "@/lib/list-params";
import { toDateInput, todayUtc } from "@/lib/dates";
import { InitiateClearanceForm } from "@/features/clearance/clearance-forms";

export const metadata = { title: "Start Exit Clearance" };

export default async function NewClearancePage({ searchParams }: PageProps<"/clearance/new">) {
  await requirePagePermission("clearance:manage");
  const sp = await searchParams;
  const employees = await db.employee.findMany({
    // Not exited and without an open clearance.
    where: { deletedAt: null, employmentStatus: { not: "EXITED" }, clearances: { none: { status: { in: ["INITIATED", "IN_PROGRESS"] } } } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } }, _count: { select: { assignments: { where: { status: "ACTIVE" } } } } },
  });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Start exit clearance" description="Collect every company asset from a leaving employee before their last day." />
      <InitiateClearanceForm
        today={toDateInput(todayUtc())}
        initialEmployeeId={param(sp, "employee")}
        employees={employees.map((e) => ({
          value: e.id,
          label: `${e.fullName} (${e.employeeCode})`,
          hint: [e.department?.name, `${e._count.assignments} asset(s) held`].filter(Boolean).join(" · "),
        }))}
      />
    </div>
  );
}
