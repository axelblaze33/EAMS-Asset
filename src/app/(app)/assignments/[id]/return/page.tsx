import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryIcon } from "@/components/shared/category-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePagePermission } from "@/lib/auth/dal";
import { toDateInput, todayUtc } from "@/lib/dates";
import { isStorageConfigured } from "@/lib/storage";
import { getAssignmentForReturn } from "@/features/assignments/queries";
import { ReturnForm } from "@/features/assignments/return-form";
import { PackageCheck } from "lucide-react";

export const metadata = { title: "Process Return" };

export default async function ReturnPage({ params }: PageProps<"/assignments/[id]/return">) {
  await requirePagePermission("assignment:return");
  const { id } = await params;
  const a = await getAssignmentForReturn(id);
  if (!a) notFound();

  if (a.status !== "ACTIVE") {
    return (
      <EmptyState
        icon={PackageCheck}
        title="Already returned"
        description={`${a.asset.assetCode} has already been checked in from ${a.employee.fullName}.`}
        action={
          <Link href={`/assets/${a.asset.id}`} className="text-sm font-medium text-primary hover:underline">
            View asset
          </Link>
        }
      />
    );
  }

  const days = differenceInCalendarDays(new Date(), a.assignedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Process return" description="Check the asset in and decide where it goes next." />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <CategoryIcon name={a.asset.category.name} className="size-10" />
          <div className="min-w-0 flex-1">
            <Link href={`/assets/${a.asset.id}`} className="font-medium hover:underline">
              {a.asset.name}
            </Link>
            <div className="text-sm text-muted-foreground">
              <span className="font-mono">{a.asset.assetCode}</span>
              {a.asset.serialNumber && ` · S/N ${a.asset.serialNumber}`}
            </div>
          </div>
          <div className="text-sm sm:text-right">
            <div>
              From <span className="font-medium">{a.employee.fullName}</span> ({a.employee.employeeCode})
            </div>
            <div className="text-muted-foreground">
              Since {format(a.assignedAt, "d MMM yyyy")} · {days} day{days === 1 ? "" : "s"}
              {a.expectedReturnAt && a.expectedReturnAt < todayUtc() && <span className="ml-1 font-medium text-amber-600">· overdue</span>}
            </div>
          </div>
        </CardContent>
      </Card>
      <ReturnForm
        assignmentId={a.id}
        assetId={a.asset.id}
        accessories={a.accessories}
        conditionAtHandover={a.conditionAtHandover}
        assignedAt={toDateInput(a.assignedAt)}
        today={toDateInput(todayUtc())}
        storageReady={isStorageConfigured()}
      />
    </div>
  );
}
