import Link from "next/link";
import { createElement } from "react";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { REPORTS, REPORT_GROUPS } from "@/features/reports/registry";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requirePagePermission("report:read");

  return (
    <>
      <PageHeader title="Reports" description="Filter any report on screen, then print it or export to Excel, CSV or PDF." />
      {REPORT_GROUPS.map((group) => (
        <section key={group} className="space-y-3" aria-labelledby={`group-${group}`}>
          <h2 id={`group-${group}`} className="text-sm font-medium text-muted-foreground">
            {group}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {REPORTS.filter((r) => r.group === group).map((r) => (
              <Link
                key={r.key}
                href={`/reports/${r.key}`}
                className="group flex items-start gap-3 rounded-xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary">
                  {createElement(r.icon, { className: "size-[18px]" })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {r.title}
                    <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{r.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
