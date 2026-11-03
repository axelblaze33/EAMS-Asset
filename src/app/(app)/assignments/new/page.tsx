import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { param } from "@/lib/list-params";
import { toDateInput, todayUtc } from "@/lib/dates";
import { isStorageConfigured } from "@/lib/storage";
import { getAssignOptions } from "@/features/assignments/queries";
import { AssignForm } from "@/features/assignments/assign-form";

export const metadata = { title: "Assign Assets" };

export default async function NewAssignmentPage({ searchParams }: PageProps<"/assignments/new">) {
  await requirePagePermission("assignment:create");
  const sp = await searchParams;
  const requestId = param(sp, "request");
  const [options, request] = await Promise.all([
    getAssignOptions(),
    requestId
      ? db.assetRequest.findFirst({ where: { id: requestId, status: "APPROVED" }, select: { id: true, requestCode: true, employeeId: true, category: { select: { name: true } } } })
      : null,
  ]);

  return (
    <>
      <PageHeader title="Assign assets" description="Hand over one or more available assets to an employee." />
      <AssignForm
        options={options}
        today={toDateInput(todayUtc())}
        initialEmployeeId={param(sp, "employee")}
        initialAssetId={param(sp, "asset")}
        request={request ? { id: request.id, code: request.requestCode, category: request.category.name, employeeId: request.employeeId } : undefined}
        storageReady={isStorageConfigured()}
      />
    </>
  );
}
