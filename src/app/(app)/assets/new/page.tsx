import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { getOrgOptions } from "@/features/master-data/queries";
import { AssetForm } from "@/features/assets/asset-form";

export const metadata = { title: "Add Asset" };

export default async function NewAssetPage() {
  await requirePagePermission("asset:create");
  const org = await getOrgOptions();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add asset" description="Register a new company asset in the inventory." />
      <AssetForm
        defaults={{
          name: "",
          categoryId: "",
          brand: "",
          model: "",
          serialNumber: "",
          assetTag: "",
          purchaseDate: "",
          purchaseCost: "",
          vendorId: "",
          invoiceNumber: "",
          warrantyStart: "",
          warrantyExpiry: "",
          condition: "NEW",
          status: "AVAILABLE",
          branchId: "",
          departmentId: "",
          specifications: [{ key: "", value: "" }],
          description: "",
        }}
        options={org}
      />
    </div>
  );
}
