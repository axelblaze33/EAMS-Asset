import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { param } from "@/lib/list-params";
import { toDateInput, todayUtc } from "@/lib/dates";
import { isStorageConfigured } from "@/lib/storage";
import { getTicketOptions } from "@/features/maintenance/queries";
import { TicketForm } from "@/features/maintenance/ticket-form";

export const metadata = { title: "New Maintenance Ticket" };

export default async function NewTicketPage({ searchParams }: PageProps<"/maintenance/new">) {
  const user = await requirePagePermission("maintenance:manage");
  const sp = await searchParams;
  const opts = await getTicketOptions();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New maintenance ticket" description="Record a fault or service job against an asset." />
      <TicketForm
        assets={opts.assets}
        assignees={opts.assignees}
        vendors={opts.vendors}
        initialAssetId={param(sp, "asset")}
        currentUserId={user.id}
        today={toDateInput(todayUtc())}
        storageReady={isStorageConfigured()}
      />
    </div>
  );
}
