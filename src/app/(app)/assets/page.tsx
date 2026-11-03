import Link from "next/link";
import { differenceInCalendarDays, format } from "date-fns";
import { Archive, Boxes, Plus, QrCode } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ExportMenu } from "@/components/shared/export-menu";
import { ImportDialog } from "@/components/shared/import-dialog";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination, SortableHead } from "@/components/shared/list-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { CategoryIcon } from "@/components/shared/category-icon";
import { hasPermission, requirePagePermission } from "@/lib/auth/dal";
import { hrefWith } from "@/lib/list-params";
import { ASSET_STATUS } from "@/lib/labels";
import { formatMoney } from "@/lib/depreciation";
import { cn } from "@/lib/utils";
import { getOrgOptions } from "@/features/master-data/queries";
import { assetFilters, listAssets } from "@/features/assets/queries";
import { importAssets } from "@/features/assets/import";
import { RestoreAssetButton } from "@/features/assets/asset-actions";

export const metadata = { title: "Assets" };

const PATH = "/assets";

function WarrantyCell({ expiry }: { expiry: Date | null }) {
  if (!expiry) return <span className="text-muted-foreground">—</span>;
  const days = differenceInCalendarDays(expiry, new Date());
  return (
    <span className={cn(days < 0 ? "text-muted-foreground" : days <= 30 ? "font-medium text-amber-600 dark:text-amber-400" : "")}>
      {format(expiry, "d MMM yyyy")}
      {days < 0 ? " · expired" : days <= 30 ? ` · ${days}d left` : ""}
    </span>
  );
}

export default async function AssetsPage({ searchParams }: PageProps<"/assets">) {
  const user = await requirePagePermission("asset:read");
  const sp = await searchParams;
  const f = assetFilters(sp);
  const [{ rows, total }, org] = await Promise.all([listAssets(f), getOrgOptions()]);
  const sortProps = { sort: f.sort, dir: f.dir, pathname: PATH, sp };
  const filtered = Boolean(f.q || f.category || f.status || f.branch || f.department || f.warranty);
  const canEmployees = hasPermission(user, "employee:read");

  return (
    <>
      <PageHeader
        title={f.archived ? "Deleted assets" : "Assets"}
        description={f.archived ? "Deleted assets keep their full history and can be restored." : "Every company-owned asset and who holds it."}
        actions={
          <>
            <Link
              href={f.archived ? PATH : hrefWith(PATH, {}, { archived: 1 })}
              className={buttonVariants({ variant: "ghost" })}
            >
              <Archive />
              {f.archived ? "Back to inventory" : "Deleted"}
            </Link>
            {!f.archived && hasPermission(user, "asset:import") && (
              <ImportDialog
                title="Import assets"
                description="Rows are matched on Serial Number: existing assets are updated, others are added with a new asset ID. Categories, vendors, branches and departments must already exist."
                templateHref="/api/templates/assets"
                action={importAssets}
              />
            )}
            {!f.archived && hasPermission(user, "asset:create") && (
              <Link href="/assets/new" className={buttonVariants()}>
                <Plus />
                Add asset
              </Link>
            )}
          </>
        }
      />

      <ListToolbar
        searchPlaceholder="Search ID, serial, tag, model, employee…"
        filters={[
          { key: "category", label: "Categories", options: org.categories },
          { key: "status", label: "Statuses", options: Object.entries(ASSET_STATUS).map(([value, m]) => ({ value, label: m.label })) },
          { key: "branch", label: "Branches", options: org.branches },
          { key: "department", label: "Departments", options: org.departments },
          {
            key: "warranty",
            label: "Warranties",
            options: [
              { value: "30", label: "Expiring in 30 days" },
              { value: "60", label: "Expiring in 60 days" },
              { value: "90", label: "Expiring in 90 days" },
              { value: "expired", label: "Warranty expired" },
            ],
          },
        ]}
      >
        <Link
          href={hrefWith("/assets/labels", sp, { page: undefined, size: undefined, sort: undefined, dir: undefined })}
          target="_blank"
          className={buttonVariants({ variant: "outline" })}
        >
          <QrCode />
          Print labels
        </Link>
        <ExportMenu endpoint="/api/export/assets" />
      </ListToolbar>

      {total === 0 && !filtered ? (
        <EmptyState
          icon={Boxes}
          title={f.archived ? "No deleted assets" : "No assets yet"}
          description={f.archived ? undefined : "Add assets one by one or import them from Excel."}
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Asset" column="code" className="pl-4" {...sortProps} />
                  <SortableHead label="Category" column="category" className="hidden md:table-cell" {...sortProps} />
                  <TableHead className="hidden lg:table-cell">Serial number</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <SortableHead label="Status" column="status" {...sortProps} />
                  <SortableHead label="Warranty" column="warranty" className="hidden xl:table-cell" {...sortProps} />
                  <SortableHead label="Cost" column="cost" className="hidden text-right xl:table-cell" {...sortProps} />
                  {f.archived && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No assets match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((a) => {
                  const holder = a.assignments[0]?.employee;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <CategoryIcon name={a.category.name} />
                          <div className="min-w-0">
                            <Link href={`/assets/${a.id}`} className="font-medium hover:text-primary hover:underline">
                              {a.name}
                            </Link>
                            <div className="font-mono text-xs text-muted-foreground">{a.assetCode}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{a.category.name}</TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">{a.serialNumber ?? "—"}</TableCell>
                      <TableCell>
                        {holder ? (
                          canEmployees ? (
                            <Link href={`/employees/${holder.id}`} className="hover:underline">
                              {holder.fullName}
                            </Link>
                          ) : (
                            holder.fullName
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge meta={ASSET_STATUS} value={a.status} />
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <WarrantyCell expiry={a.warrantyExpiry} />
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums xl:table-cell">
                        {a.purchaseCost ? formatMoney(Number(a.purchaseCost)) : "—"}
                      </TableCell>
                      {f.archived && (
                        <TableCell className="pr-4 text-right">
                          {hasPermission(user, "asset:delete") && <RestoreAssetButton id={a.id} />}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination total={total} page={f.page} pageSize={f.pageSize} pathname={PATH} sp={sp} />
        </div>
      )}
    </>
  );
}
