import { cn } from "@/lib/utils";
import { TONE_CLASS, type Tone } from "@/lib/labels";

export function StatusBadge({
  meta,
  value,
  className,
}: {
  meta: Record<string, { label: string; tone: Tone }>;
  value: string;
  className?: string;
}) {
  const entry = meta[value] ?? { label: value, tone: "neutral" as Tone };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[entry.tone],
        className,
      )}
    >
      {entry.label}
    </span>
  );
}
