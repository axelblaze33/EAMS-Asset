"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Toggle common accessories, or type a custom one. */
export function AccessoryInput({
  value,
  onChange,
  suggestions,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const options = [...new Set([...suggestions, ...value])];
  const toggle = (a: string) => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a]);
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((a) => {
        const on = value.includes(a);
        return (
          <button
            key={a}
            type="button"
            disabled={disabled}
            onClick={() => toggle(a)}
            aria-pressed={on}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors",
              on ? "border-primary/40 bg-brand-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {on && <X className="size-3" />}
            {a}
          </button>
        );
      })}
      <span className="inline-flex h-6 items-center rounded-full border border-dashed bg-card pr-1 pl-2.5">
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value.slice(0, 60))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Other…"
          aria-label="Add another accessory"
          className="w-20 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        <button type="button" onClick={add} disabled={disabled || !draft.trim()} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40" aria-label="Add accessory">
          <Plus className="size-3" />
        </button>
      </span>
    </div>
  );
}
