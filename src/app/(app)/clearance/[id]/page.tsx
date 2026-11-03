import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryIcon } from "@/components/shared/category-icon";
import { DetailList } from "@/components/shared/detail-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { todayUtc } from "@/lib/dates";
import { formatMoney } from "@/lib/depreciation";
import { CLEARANCE_ITEM, CLEARANCE_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getClearance } from "@/features/clearance/queries";
import { ClearanceControls, ClearanceItemActions } from "@/features/clearance/clearance-forms";

export const metadata = { title: "Exit Clearance" };

export default async function ClearanceDetailPage({ params }: PageProps<"/clearance/[id]">) {
  const user = await requirePagePermission("clearance:read");
  const { id } = await params;
  const c = await getClearance(id);
  if (!c) notFound();

  const open = c.status === "INITIATED" || c.status === "IN_PROGRESS";
  const canManage = open && hasPermission(user, "clearance:manage");
  const canReturn = hasPermission(user, "assignment:return");
  const pending = c.items.filter((i) => i.resolution === "PENDING");
  const recovery = c.items.reduce((s, i) => s + (i.recoveryAmount ? Number(i.recoveryAmount) : 0), 0);
  const days = differenceInCalendarDays(c.lastWorkingDay, todayUtc());

  return (
    <>
      <PageHeader
        title={`Exit clearance: ${c.employee.fullName}`}
        description={[c.employee.employeeCode, c.employee.designation?.title, c.employee.department?.name].filter(Boolean).join(" · ")}
        actions={canManage && <ClearanceControls id={c.id} employeeName={c.employee.fullName} pendingCount={pending.length} />}
      />

      {open && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            pending.length === 0 ? "border-emerald-500/30 bg-emerald-500/5" : days <= 3 ? "border-amber-500/30 bg-amber-500/5" : "bg-card",
          )}
        >
          {pending.length === 0
            ? "Every asset is resolved. Complete the clearance to mark the employee as exited."
            : `${pending.length} of ${c.items.length} asset(s) still to collect. Last working day ${days < 0 ? `was ${-days} day(s) ago` : days === 0 ? "is today" : `is in ${days} day(s)`}.`}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Assets ({c.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {c.items.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">The employee held no company assets when the clearance started.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Asset</TableHead>
                    <TableHead className="hidden md:table-cell">Value</TableHead>
                    <TableHead>Outcome</TableHead>
                    {canManage && <TableHead className="w-56" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.items.map((i) => {
                    const active = i.asset.assignments.find((a) => a.employeeId === c.employeeId);
                    return (
                      <TableRow key={i.id} className="align-top">
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-3">
                            <CategoryIcon name={i.asset.category.name} />
                            <div className="min-w-0">
                              <Link href={`/assets/${i.asset.id}`} className="font-medium hover:underline">
                                {i.asset.name}
                              </Link>
                              <div className="font-mono text-xs text-muted-foreground">
                                {i.asset.assetCode}
                                {i.asset.serialNumber && ` · ${i.asset.serialNumber}`}
                              </div>
                              {active && active.accessories.length > 0 && <div className="text-xs text-muted-foreground">With: {active.accessories.join(", ")}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden tabular-nums md:table-cell">{i.asset.purchaseCost ? formatMoney(Number(i.asset.purchaseCost)) : "—"}</TableCell>
                        <TableCell className="max-w-64 whitespace-normal">
                          <StatusBadge meta={CLEARANCE_ITEM} value={i.resolution} />
                          {i.notes && <div className="mt-1 text-xs text-muted-foreground">{i.notes}</div>}
                          {i.recoveryAmount && <div className="mt-0.5 text-xs">Recovery: {formatMoney(Number(i.recoveryAmount))}</div>}
                        </TableCell>
                        {canManage && (
                          <TableCell className="pr-4">
                            {i.resolution === "PENDING" && (
                              <ClearanceItemActions itemId={i.id} assetLabel={`${i.asset.assetCode} ${i.asset.name}`} returnAssignmentId={canReturn ? active?.id : undefined} />
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Details
              <StatusBadge meta={CLEARANCE_STATUS} value={c.status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                [
                  "Employee",
                  <Link key="e" href={`/employees/${c.employee.id}`} className="hover:underline">
                    {c.employee.fullName}
                  </Link>,
                ],
                ["Manager", c.employee.manager?.fullName],
                ["Last working day", format(c.lastWorkingDay, "d MMM yyyy")],
                ["Started", `${format(c.createdAt, "d MMM yyyy")} by ${c.initiatedBy.name}`],
                ...(c.completedAt ? ([["Completed", `${format(c.completedAt, "d MMM yyyy")}${c.completedBy ? ` by ${c.completedBy.name}` : ""}`]] as [string, string][]) : []),
                ["To recover", recovery ? formatMoney(recovery) : "None"],
                ["Notes", c.notes && <span key="n" className="whitespace-pre-line">{c.notes}</span>],
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
