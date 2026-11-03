import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, format, formatDistanceToNow } from "date-fns";
import { Activity, ArrowRightLeft, FileText, History, ImageOff, Pencil, Printer, QrCode, Undo2, UserRound, Wrench } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { DetailList } from "@/components/shared/detail-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { ACKNOWLEDGEMENT, ACKNOWLEDGEMENT_METHOD, ASSET_CONDITION, ASSET_STATUS, MAINTENANCE_STATUS } from "@/lib/labels";
import { bookValue, formatMoney } from "@/lib/depreciation";
import { isStorageConfigured, signedUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { getAsset, getAssetActivity } from "@/features/assets/queries";
import { assetQrSvg } from "@/features/assets/qr";
import { AssetDocuments } from "@/features/assets/asset-documents";
import { DeleteAssetButton, RestoreAssetButton } from "@/features/assets/asset-actions";

export const metadata = { title: "Asset" };

const d = (date: Date | null | undefined) => (date ? format(date, "d MMM yyyy") : "—");

export default async function AssetPage({ params }: PageProps<"/assets/[id]">) {
  const user = await requirePagePermission("asset:read");
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) notFound();

  const storageReady = isStorageConfigured();
  const image = asset.documents.find((doc) => doc.type === "ASSET_IMAGE");
  const [activity, qr, imageUrl] = await Promise.all([
    getAssetActivity(asset.id),
    assetQrSvg(asset.id),
    image && storageReady ? signedUrl(image.storagePath, 3600).catch(() => null) : null,
  ]);

  const current = asset.assignments.find((a) => a.status === "ACTIVE");
  const cost = asset.purchaseCost ? Number(asset.purchaseCost) : null;
  const depreciation = bookValue({
    cost,
    purchaseDate: asset.purchaseDate,
    usefulLifeMonths: asset.category.usefulLifeMonths,
    salvagePercent: Number(asset.category.salvagePercent),
  });
  const warrantyDays = asset.warrantyExpiry ? differenceInCalendarDays(asset.warrantyExpiry, new Date()) : null;
  const specs = Object.entries((asset.specifications as Record<string, string> | null) ?? {});
  const canEdit = hasPermission(user, "asset:update") && !asset.deletedAt;
  const canEmployees = hasPermission(user, "employee:read");
  const openTickets = asset.maintenance.filter((m) => ["OPEN", "IN_PROGRESS", "PENDING_PARTS"].includes(m.status)).length;

  const employeeLink = (e: { id: string; fullName: string }) =>
    canEmployees ? (
      <Link href={`/employees/${e.id}`} className="font-medium hover:underline">
        {e.fullName}
      </Link>
    ) : (
      <span className="font-medium">{e.fullName}</span>
    );

  return (
    <>
      <PageHeader
        title={asset.name}
        description={[asset.assetCode, asset.category.name, asset.serialNumber && `S/N ${asset.serialNumber}`].filter(Boolean).join(" · ")}
        actions={
          <>
            {!asset.deletedAt && asset.status === "AVAILABLE" && hasPermission(user, "assignment:create") && (
              <Link href={`/assignments/new?asset=${asset.id}`} className={buttonVariants()}>
                <ArrowRightLeft />
                Assign
              </Link>
            )}
            {current && hasPermission(user, "assignment:return") && (
              <Link href={`/assignments/${current.id}/return`} className={buttonVariants()}>
                <Undo2 />
                Process return
              </Link>
            )}
            {!asset.deletedAt && !(["LOST", "DISPOSED"] as string[]).includes(asset.status) && hasPermission(user, "maintenance:manage") && (
              <Link href={`/maintenance/new?asset=${asset.id}`} className={buttonVariants({ variant: "outline" })}>
                <Wrench />
                Report issue
              </Link>
            )}
            <Link href={`/assets/${asset.id}/label`} target="_blank" className={buttonVariants({ variant: "outline" })}>
              <Printer />
              Print label
            </Link>
            {canEdit && (
              <Link href={`/assets/${asset.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                <Pencil />
                Edit
              </Link>
            )}
            {hasPermission(user, "asset:delete") &&
              (asset.deletedAt ? (
                <RestoreAssetButton id={asset.id} />
              ) : (
                <DeleteAssetButton
                  id={asset.id}
                  label={asset.assetCode}
                  disabledReason={
                    asset.status === "ASSIGNED"
                      ? "Return this asset before deleting it."
                      : openTickets
                        ? "Close the open maintenance tickets for this asset first."
                        : undefined
                  }
                />
              ))}
          </>
        }
      />

      {asset.deletedAt && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          This asset was deleted on {d(asset.deletedAt)}. It is hidden from the inventory until restored.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card className="pt-0">
            <div className="flex aspect-[4/3] items-center justify-center bg-muted">
              {imageUrl ? (
                // Signed, short-lived URL from private storage; next/image can't optimise it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={asset.name} className="h-full w-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <ImageOff className="size-6" />
                  No image
                </div>
              )}
            </div>
            <CardContent className="flex flex-wrap items-center gap-2">
              <StatusBadge meta={ASSET_STATUS} value={asset.status} />
              <StatusBadge meta={ASSET_CONDITION} value={asset.condition} />
              {openTickets > 0 && <span className="text-xs text-muted-foreground">{openTickets} open ticket(s)</span>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-4" />
                Current holder
              </CardTitle>
            </CardHeader>
            <CardContent>
              {current ? (
                <DetailList
                  items={[
                    ["Employee", employeeLink(current.employee)],
                    ["Employee ID", <span key="c" className="font-mono text-xs">{current.employee.employeeCode}</span>],
                    ["Department", current.employee.department?.name],
                    ["Since", d(current.assignedAt)],
                    ["Return by", d(current.expectedReturnAt)],
                    ["Accessories", current.accessories.join(", ") || "None"],
                    [
                      "Handover",
                      <span key="a" className="flex flex-col items-start gap-1">
                        <StatusBadge meta={ACKNOWLEDGEMENT} value={current.acknowledgement} />
                        {current.acknowledgementMethod && (
                          <span className="text-xs text-muted-foreground">{ACKNOWLEDGEMENT_METHOD[current.acknowledgementMethod].label}</span>
                        )}
                      </span>,
                    ],
                    [
                      "Form",
                      <Link key="f" href={`/assignments/handover/${current.batchId ?? current.id}`} className="text-primary hover:underline">
                        View handover
                      </Link>,
                    ],
                  ]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Not assigned to anyone.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="size-4" />
                QR code
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              {/* SVG generated server-side by the qrcode library from our own URL. */}
              <div className="size-28 shrink-0 rounded-md bg-white p-2 text-black [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr.svg }} />
              <p className="text-xs break-all text-muted-foreground">
                Scanning opens this page. <br />
                <span className="font-mono">{qr.url}</span>
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <DetailList
                items={[
                  ["Asset ID", <span key="c" className="font-mono">{asset.assetCode}</span>],
                  ["Category", asset.category.name],
                  ["Brand", asset.brand],
                  ["Model", asset.model],
                  ["Serial number", asset.serialNumber && <span key="s" className="font-mono text-xs">{asset.serialNumber}</span>],
                  ["Asset tag", asset.assetTag && <span key="t" className="font-mono text-xs">{asset.assetTag}</span>],
                  ["Branch", asset.branch?.name],
                  ["Department", asset.department?.name],
                ]}
              />
              <DetailList
                items={[
                  ["Purchase date", d(asset.purchaseDate)],
                  ["Purchase cost", formatMoney(cost)],
                  ["Book value", depreciation ? `${formatMoney(depreciation.value)}${depreciation.fullyDepreciated ? " (fully depreciated)" : ""}` : "—"],
                  ["Vendor", asset.vendor?.name],
                  ["Invoice no.", asset.invoiceNumber],
                  ["Warranty start", d(asset.warrantyStart)],
                  [
                    "Warranty expiry",
                    asset.warrantyExpiry && (
                      <span key="w" className={cn(warrantyDays !== null && warrantyDays >= 0 && warrantyDays <= 30 && "font-medium text-amber-600 dark:text-amber-400")}>
                        {d(asset.warrantyExpiry)}
                        {warrantyDays !== null && (warrantyDays < 0 ? " (expired)" : ` (${warrantyDays} days left)`)}
                      </span>
                    ),
                  ],
                  ["Added", `${d(asset.createdAt)}${asset.createdBy ? ` by ${asset.createdBy.name}` : ""}`],
                ]}
              />
              {(specs.length > 0 || asset.description) && (
                <div className="space-y-3 md:col-span-2">
                  {specs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {specs.map(([k, v]) => (
                        <span key={k} className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
                          <span className="text-muted-foreground">{k}:</span> {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                  {asset.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{asset.description}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" />
                Documents ({asset.documents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AssetDocuments
                assetId={asset.id}
                canEdit={canEdit}
                storageReady={storageReady}
                documents={asset.documents.map((doc) => ({
                  id: doc.id,
                  type: doc.type,
                  fileName: doc.fileName,
                  mimeType: doc.mimeType,
                  sizeBytes: doc.sizeBytes,
                  createdAt: doc.createdAt,
                  uploadedBy: doc.uploadedBy,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4" />
                Assignment history ({asset.assignments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {asset.assignments.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">Never assigned.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Employee</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Returned</TableHead>
                      <TableHead className="hidden md:table-cell">Condition out → in</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {asset.assignments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="pl-4">
                          {employeeLink(a.employee)}
                          <div className="text-xs text-muted-foreground">by {a.assignedBy.name}</div>
                        </TableCell>
                        <TableCell>{d(a.assignedAt)}</TableCell>
                        <TableCell>{a.return ? d(a.return.returnedAt) : <span className="font-medium text-sky-700 dark:text-sky-400">Current</span>}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="inline-flex items-center gap-1.5">
                            <StatusBadge meta={ASSET_CONDITION} value={a.conditionAtHandover} />
                            {a.return && (
                              <>
                                →<StatusBadge meta={ASSET_CONDITION} value={a.return.conditionAtReturn} />
                              </>
                            )}
                          </span>
                          {a.return?.damageNotes && <div className="mt-1 text-xs whitespace-normal text-muted-foreground">{a.return.damageNotes}</div>}
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
                <Wrench className="size-4" />
                Maintenance ({asset.maintenance.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {asset.maintenance.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">No maintenance records.</p>
              ) : (
                <Table>
                  <TableBody>
                    {asset.maintenance.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="pl-4">
                          <div className="font-medium whitespace-normal">{m.issue}</div>
                          <Link href={`/maintenance/${m.id}`} className="font-mono text-xs text-primary hover:underline">
                            {m.ticketCode}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{m.vendor?.name ?? "—"}</TableCell>
                        <TableCell>{d(m.startedAt ?? m.createdAt)}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.cost ? formatMoney(Number(m.cost)) : "—"}</TableCell>
                        <TableCell className="pr-4">
                          <StatusBadge meta={MAINTENANCE_STATUS} value={m.status} />
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
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Activity className="size-4" />
                  Activity
                </span>
                {hasPermission(user, "report:read") && (
                  <Link href={`/reports/asset-history?asset=${asset.id}`} className="text-sm font-normal text-primary hover:underline">
                    Full history report
                  </Link>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recorded activity.</p>
              ) : (
                <ol className="relative space-y-4 border-l pl-5">
                  {activity.map((log) => (
                    <li key={log.id} className="relative">
                      <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-background bg-muted-foreground/60" />
                      <p className="text-sm">{log.summary ?? log.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.actor?.name ?? "System"} · {formatDistanceToNow(log.createdAt, { addSuffix: true })}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
