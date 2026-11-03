import { requirePagePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { assetFilters, assetWhere } from "@/features/assets/queries";
import { assetQrSvg } from "@/features/assets/qr";
import { AssetLabel, PrintToolbar } from "@/features/assets/asset-label";

export const metadata = { title: "Asset labels" };

const MAX_LABELS = 300;

/** Labels for every asset matching the inventory filters in the URL. */
export default async function AssetLabelsPage({ searchParams }: PageProps<"/assets/labels">) {
  await requirePagePermission("asset:read");
  const assets = await db.asset.findMany({
    where: assetWhere(assetFilters(await searchParams)),
    orderBy: { assetCode: "asc" },
    take: MAX_LABELS,
    select: { id: true, assetCode: true, name: true, serialNumber: true },
  });
  const svgs = await Promise.all(assets.map((a) => assetQrSvg(a.id)));
  const company = process.env.COMPANY_NAME ?? "Company property";

  return (
    <>
      <PrintToolbar count={assets.length} />
      {assets.length === MAX_LABELS && (
        <p className="mb-4 text-sm text-amber-700 print:hidden">Showing the first {MAX_LABELS}. Narrow the filters to print the rest.</p>
      )}
      <div className="flex flex-wrap gap-2 print:gap-1">
        {assets.map((a, i) => (
          <AssetLabel key={a.id} svg={svgs[i]!.svg} assetCode={a.assetCode} name={a.name} serialNumber={a.serialNumber} company={company} />
        ))}
      </div>
    </>
  );
}
