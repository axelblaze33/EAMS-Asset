import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { assetQrSvg } from "@/features/assets/qr";
import { AssetLabel, PrintToolbar } from "@/features/assets/asset-label";

export const metadata = { title: "Asset label" };

export default async function AssetLabelPage({ params }: PageProps<"/assets/[id]/label">) {
  await requirePagePermission("asset:read");
  const { id } = await params;
  const asset = await db.asset.findUnique({ where: { id }, select: { id: true, assetCode: true, name: true, serialNumber: true } });
  if (!asset) notFound();
  const { svg } = await assetQrSvg(asset.id);

  return (
    <>
      <PrintToolbar count={1} />
      <AssetLabel svg={svg} assetCode={asset.assetCode} name={asset.name} serialNumber={asset.serialNumber} company={process.env.COMPANY_NAME ?? "Company property"} />
    </>
  );
}
