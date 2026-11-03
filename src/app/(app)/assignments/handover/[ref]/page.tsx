import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle2, Clock, FileDown, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryIcon } from "@/components/shared/category-icon";
import { DetailList } from "@/components/shared/detail-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { ACKNOWLEDGEMENT, ACKNOWLEDGEMENT_METHOD, ASSET_CONDITION } from "@/lib/labels";
import { toDateInput, todayUtc } from "@/lib/dates";
import { isStorageConfigured } from "@/lib/storage";
import { getHandover } from "@/features/assignments/queries";
import { HandoverFiles } from "@/features/assignments/handover-files";
import { RecordAcknowledgement } from "@/features/assignments/record-acknowledgement";

export const metadata = { title: "Handover" };

export default async function HandoverPage({ params }: PageProps<"/assignments/handover/[ref]">) {
  const user = await requirePagePermission("assignment:read");
  const { ref } = await params;
  const h = await getHandover(ref);
  if (!h) notFound();

  const acked = h.items.filter((i) => i.acknowledgement === "ACKNOWLEDGED").length;
  const pending = h.items.filter((i) => i.status === "ACTIVE" && i.acknowledgement === "PENDING");
  const lastAck = h.items.filter((i) => i.acknowledgedAt).sort((a, b) => b.acknowledgedAt!.getTime() - a.acknowledgedAt!.getTime())[0];
  const docs = h.items.flatMap((i) => i.documents.filter((d) => d.type === "HANDOVER"));

  return (
    <>
      <PageHeader
        title={`Handover to ${h.employee.fullName}`}
        description={`${h.items.length} asset${h.items.length === 1 ? "" : "s"} · ${format(h.assignedAt, "d MMM yyyy")} · issued by ${h.assignedBy.name}`}
        actions={
          <>
            {hasPermission(user, "assignment:create") && (
              <Link href={`/assignments/new?employee=${h.employee.id}`} className={buttonVariants({ variant: "outline" })}>
                <Plus />
                Assign more
              </Link>
            )}
            <a href={`/api/handover/${h.ref}`} target="_blank" className={buttonVariants({ variant: pending.length && hasPermission(user, "assignment:create") ? "outline" : "default" })}>
              <FileDown />
              Handover form (PDF)
            </a>
            {pending.length > 0 && hasPermission(user, "assignment:create") && (
              <RecordAcknowledgement
                employeeName={h.employee.fullName}
                pending={pending.map((i) => ({ id: i.id, label: `${i.asset.assetCode} · ${i.asset.name}` }))}
                minDate={toDateInput(h.assignedAt)}
                today={toDateInput(todayUtc())}
              />
            )}
          </>
        }
      />

      <div
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
          acked === h.items.length ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        {acked === h.items.length ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        ) : (
          <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" />
        )}
        <p>
          {acked === h.items.length
            ? `${h.employee.fullName} acknowledged receipt${lastAck?.acknowledgementMethod ? ` (${ACKNOWLEDGEMENT_METHOD[lastAck.acknowledgementMethod].label.toLowerCase()})` : ""}${lastAck?.acknowledgedBy ? `, recorded by ${lastAck.acknowledgedBy.name}` : ""}.`
            : `${acked} of ${h.items.length} acknowledged. Print the handover form for ${h.employee.fullName} to sign, then record the acknowledgement and attach the signed copy.`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Assets</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Asset</TableHead>
                  <TableHead className="hidden sm:table-cell">Condition</TableHead>
                  <TableHead className="hidden md:table-cell">Accessories</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {h.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <CategoryIcon name={i.asset.category.name} />
                        <div>
                          <Link href={`/assets/${i.asset.id}`} className="font-medium hover:underline">
                            {i.asset.name}
                          </Link>
                          <div className="font-mono text-xs text-muted-foreground">{i.asset.assetCode}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge meta={ASSET_CONDITION} value={i.conditionAtHandover} />
                    </TableCell>
                    <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">{i.accessories.join(", ") || "None"}</TableCell>
                    <TableCell>
                      {i.status === "RETURNED" ? (
                        <span className="text-xs text-muted-foreground">Returned</span>
                      ) : (
                        <StatusBadge meta={ACKNOWLEDGEMENT} value={i.acknowledgement} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Employee</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  [
                    "Name",
                    hasPermission(user, "employee:read") ? (
                      <Link key="n" href={`/employees/${h.employee.id}`} className="hover:underline">
                        {h.employee.fullName}
                      </Link>
                    ) : (
                      h.employee.fullName
                    ),
                  ],
                  ["Employee ID", h.employee.employeeCode],
                  ["Department", h.employee.department?.name],
                  ["Return by", h.expectedReturnAt ? format(h.expectedReturnAt, "d MMM yyyy") : "Not set"],
                  ["Remarks", h.remarks],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Signed copy</CardTitle>
              <CardDescription>Attach the signed paper form if the employee signed offline.</CardDescription>
            </CardHeader>
            <CardContent>
              <HandoverFiles
                assignmentId={h.items[0]!.id}
                documents={docs.map((d) => ({ id: d.id, fileName: d.fileName }))}
                canAttach={hasPermission(user, "assignment:create")}
                storageReady={isStorageConfigured()}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
