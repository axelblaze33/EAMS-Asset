import { createElement } from "react";
import {
  Headphones,
  IdCard,
  KeyRound,
  Keyboard,
  Laptop,
  Monitor,
  Mouse,
  Network,
  Package,
  Printer,
  Server,
  Smartphone,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Categories are user-defined, so match on keywords and fall back to a box.
// Order matters: "headphones" must match before "phone".
const RULES: [RegExp, LucideIcon][] = [
  [/laptop|notebook|macbook/i, Laptop],
  [/desktop|workstation|server|pc\b/i, Server],
  [/monitor|display|screen/i, Monitor],
  [/tablet|ipad/i, Tablet],
  [/keyboard/i, Keyboard],
  [/mouse/i, Mouse],
  [/head(phone|set)|earphone|audio/i, Headphones],
  [/phone|mobile/i, Smartphone],
  [/printer|scanner/i, Printer],
  [/network|router|switch|firewall/i, Network],
  [/card|badge|id\b/i, IdCard],
  [/licen[cs]e|software|subscription/i, KeyRound],
];

export function categoryIcon(name: string): LucideIcon {
  return RULES.find(([re]) => re.test(name))?.[1] ?? Package;
}

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-muted-foreground", className)} aria-hidden>
      {createElement(categoryIcon(name), { className: "size-4" })}
    </span>
  );
}
