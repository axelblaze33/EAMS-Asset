import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/dates";
import { getOrgOptions } from "@/features/master-data/queries";
import { AssetForm } from "@/features/assets/asset-form";

export const metadata = { title: "Edit Asset" };

export default async function EditAssetPage({ params }: PageProps<"/assets/[id]/edit">) {
  await requirePagePermission("asset:update");
  const { id } = await params;
  const [asset, org] = await Promise.all([
    db.asset.findFirst({
      where: { id, deletedAt: null },
      include: { category: true, vendor: true, branch: true, department: true },
    }),
    getOrgOptions(),
  ]);
  if (!asset) notFound();

  // Keep an archived category/vendor/etc. selectable if this asset still uses it.
  const withCurrent = (opts: { value: string; label: string }[], current: { id: string; name: string } | null) =>
    current && !opts.some((o) => o.value === current.id) ? [...opts, { value: current.id, label: `${current.name} (archived)` }] : opts;

  const specs = Object.entries((asset.specifications as Record<string, string> | null) ?? {}).map(([key, value]) => ({ key, value: String(value) }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Edit ${asset.name}`} description={asset.assetCode} />
      <AssetForm
        id={asset.id}
        lockedStatus={asset.status === "ASSIGNED"}
        defaults={{
          name: asset.name,
          categoryId: asset.categoryId,
          brand: asset.brand ?? "",
          model: asset.model ?? "",
          serialNumber: asset.serialNumber ?? "",
          assetTag: asset.assetTag ?? "",
          purchaseDate: toDateInput(asset.purchaseDate),
          purchaseCost: asset.purchaseCost?.toString() ?? "",
          vendorId: asset.vendorId ?? "",
          invoiceNumber: asset.invoiceNumber ?? "",
          warrantyStart: toDateInput(asset.warrantyStart),
          warrantyExpiry: toDateInput(asset.warrantyExpiry),
          condition: asset.condition,
          status: asset.status,
          branchId: asset.branchId ?? "",
          departmentId: asset.departmentId ?? "",
          specifications: specs.length ? specs : [{ key: "", value: "" }],
          description: asset.description ?? "",
        }}
        options={{
          categories: withCurrent(org.categories, asset.category),
          vendors: withCurrent(org.vendors, asset.vendor),
          branches: withCurrent(org.branches, asset.branch),
          departments: withCurrent(org.departments, asset.department),
        }}
      />
    </div>
  );
}
