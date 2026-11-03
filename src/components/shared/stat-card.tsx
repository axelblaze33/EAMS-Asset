import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASS, type Tone } from "@/lib/labels";

const ICON_TONE: Record<Tone | "brand", string> = { ...TONE_CLASS, brand: "bg-brand-soft text-primary" };

/** KPI tile: tinted icon, label, big number. Links through when `href` is set. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "brand",
  hint,
  href,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: Tone | "brand";
  hint?: string;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-all",
        href && "hover:-translate-y-px hover:border-primary/30 hover:shadow-sm",
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn("flex size-9 items-center justify-center rounded-lg", ICON_TONE[tone])}>
          <Icon className="size-[18px]" />
        </div>
        {href && <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <div>
        <div className="text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div className="mt-1.5 text-sm text-muted-foreground">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground/80">{hint}</div>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}
