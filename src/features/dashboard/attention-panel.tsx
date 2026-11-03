import Link from "next/link";
import { createElement } from "react";
import { ChevronRight, CircleCheck, type LucideIcon } from "lucide-react";
import { TONE_CLASS, type Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Item = { show: boolean; count: number; label: string; href: string; icon: LucideIcon; tone: Tone };

/** Actionable counts; anything at zero (or not permitted) is hidden. */
export function AttentionPanel({ items }: { items: Item[] }) {
  const visible = items.filter((i) => i.show && i.count > 0);
  const anyAllowed = items.some((i) => i.show);
  if (!anyAllowed) return null;

  return (
    <section aria-labelledby="attention-heading" className="rounded-xl border bg-card p-4 shadow-xs">
      <h2 id="attention-heading" className="mb-3 text-sm font-medium">
        Needs attention
      </h2>
      {visible.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-emerald-600" />
          All clear: nothing overdue or waiting on you.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((i) => (
            <li key={i.href + i.label}>
              <Link href={i.href} className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/40">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", TONE_CLASS[i.tone])}>
                  {createElement(i.icon, { className: "size-4" })}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold tabular-nums">{i.count}</span> {i.label}
                </span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
