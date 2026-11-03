import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";
import { MASTER, MASTER_ENTITIES, type MasterEntity } from "@/features/master-data/config";
import { listMaster } from "@/features/master-data/queries";
import { MasterTable } from "@/features/master-data/master-table";

export const metadata = { title: "Master Data" };

export default async function MasterDataPage({ searchParams }: PageProps<"/settings/master-data">) {
  await requirePagePermission("master:manage");
  const { tab } = await searchParams;
  const entity: MasterEntity = MASTER_ENTITIES.includes(tab as MasterEntity) ? (tab as MasterEntity) : "categories";
  const rows = await listMaster(entity);

  return (
    <>
      <PageHeader title="Master Data" description="Lists used across employee and asset records." />
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Master data">
        {MASTER_ENTITIES.map((e) => (
          <Link
            key={e}
            href={`/settings/master-data?tab=${e}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              e === entity ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={e === entity ? "page" : undefined}
          >
            {MASTER[e].label}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">{MASTER[entity].description}</p>
      <MasterTable key={entity} entity={entity} rows={rows} />
    </>
  );
}
