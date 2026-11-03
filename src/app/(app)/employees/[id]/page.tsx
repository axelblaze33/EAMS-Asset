import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowRightLeft, ClipboardList, History, Laptop, LogOut, Pencil, Undo2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailList } from "@/components/shared/detail-list";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { ACKNOWLEDGEMENT, ASSET_CONDITION, EMPLOYMENT_STATUS, REQUEST_STATUS } from "@/lib/labels";
import { getEmployee } from "@/features/employees/queries";

export const metadata = { title: "Employee" };

const d = (date: Date | null | undefined) => (date ? format(date, "d MMM yyyy") : "—");

export default async function EmployeePage({ params }: PageProps<"/employees/[id]">) {
  const user = await requirePagePermission("employee:read");
  const { id } = await params;
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const active = employee.assignments.filter((a) => a.status === "ACTIVE");
  const history = employee.assignments.filter((a) => a.status === "RETURNED");
  const canSeeAssets = hasPermission(user, "asset:read");
  const canReturn = hasPermission(user, "assignment:return");

  const assetLink = (a: (typeof employee.assignments)[number]) =>
    canSeeAssets ? (
      <Link href={`/assets/${a.asset.id}`} className="font-medium hover:underline">
        {a.asset.name}
      </Link>
    ) : (
      <span className="font-medium">{a.asset.name}</span>
    );

  return (
    <>
      <PageHeader
        title={employee.fullName}
        description={[employee.employeeCode, employee.designation?.title, employee.department?.name].filter(Boolean).join(" · ")}
        actions={
          <>
            {hasPermission(user, "employee:update") && (
              <Link href={`/employees/${employee.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                <Pencil />
                Edit
              </Link>
            )}
            {hasPermission(user, "clearance:read") && employee.clearances[0] ? (
              <Link href={`/clearance/${employee.clearances[0].id}`} className={buttonVariants({ variant: "outline" })}>
                <LogOut />
                View exit clearance
              </Link>
            ) : (
              hasPermission(user, "clearance:manage") &&
              employee.employmentStatus !== "EXITED" && (
                <Link href={`/clearance/new?employee=${employee.id}`} className={buttonVariants({ variant: "outline" })}>
                  <LogOut />
                  Start exit clearance
                </Link>
              )
            )}
            {hasPermission(user, "request:create") && employee.employmentStatus !== "EXITED" && (
              <Link href={`/requests/new?employee=${employee.id}`} className={buttonVariants({ variant: "outline" })}>
                <ClipboardList />
                Log request
              </Link>
            )}
            {hasPermission(user, "assignment:create") && employee.employmentStatus !== "EXITED" && !employee.clearances[0] && (
              <Link href={`/assignments/new?employee=${employee.id}`} className={buttonVariants()}>
                <ArrowRightLeft />
                Assign assets
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Details
              <StatusBadge meta={EMPLOYMENT_STATUS} value={employee.employmentStatus} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                ["Email", employee.email],
                ["Phone", employee.phone],
                ["Department", employee.department?.name],
                ["Designation", employee.designation?.title],
                ["Branch", employee.branch?.name],
                [
                  "Reports to",
                  employee.manager && (
                    <Link href={`/employees/${employee.manager.id}`} className="hover:underline">
                      {employee.manager.fullName}
                    </Link>
                  ),
                ],
                ["Joined", d(employee.joiningDate)],
                ...(employee.exitDate ? ([["Exited", d(employee.exitDate)]] as [string, string][]) : []),
                ["Login", employee.user ? `${employee.user.role.name}${employee.user.isActive ? "" : " (deactivated)"}` : "No login"],
                ...(employee.reports.length
                  ? ([
                      [
                        "Direct reports",
                        <span key="r" className="flex flex-col">
                          {employee.reports.map((r) => (
                            <Link key={r.id} href={`/employees/${r.id}`} className="hover:underline">
                              {r.fullName}
                            </Link>
                          ))}
                        </span>,
                      ],
                    ] as [string, React.ReactNode][])
                  : []),
              ]}
            />
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Laptop className="size-4" />
                Current assets ({active.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {active.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">No assets currently assigned.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Asset</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead className="hidden sm:table-cell">Condition</TableHead>
                      <TableHead>Acknowledgement</TableHead>
                      {canReturn && <TableHead className="w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="pl-4">
                          {assetLink(a)}
                          <div className="font-mono text-xs text-muted-foreground">
                            {a.asset.assetCode} · {a.asset.category.name}
                          </div>
                        </TableCell>
                        <TableCell>{d(a.assignedAt)}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <StatusBadge meta={ASSET_CONDITION} value={a.conditionAtHandover} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge meta={ACKNOWLEDGEMENT} value={a.acknowledgement} />
                        </TableCell>
                        {canReturn && (
                          <TableCell className="pr-4 text-right">
                            <Link href={`/assignments/${a.id}/return`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                              <Undo2 />
                              Return
                            </Link>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4" />
                Allocation history ({history.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {history.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">No returned assets yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Asset</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Returned</TableHead>
                      <TableHead className="hidden sm:table-cell">Returned condition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="pl-4">
                          {assetLink(a)}
                          <div className="font-mono text-xs text-muted-foreground">{a.asset.assetCode}</div>
                        </TableCell>
                        <TableCell>{d(a.assignedAt)}</TableCell>
                        <TableCell>{d(a.return?.returnedAt)}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {a.return && <StatusBadge meta={ASSET_CONDITION} value={a.return.conditionAtReturn} />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="size-4" />
                Asset requests ({employee.requests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {employee.requests.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">No asset requests.</p>
              ) : (
                <Table>
                  <TableBody>
                    {employee.requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="pl-4">
                          <div className="font-medium">{r.category.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{r.requestCode}</div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">{r.reason}</TableCell>
                        <TableCell>{d(r.createdAt)}</TableCell>
                        <TableCell>
                          <StatusBadge meta={REQUEST_STATUS} value={r.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
