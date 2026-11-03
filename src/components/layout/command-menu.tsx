"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Plus, Search, Sun, UserRound, Boxes } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { Permission } from "@/lib/auth/permissions";
import { visibleNav } from "./nav-config";

/** Ctrl/⌘ + K: jump to any page, start common actions, or search records. */
export function CommandMenu({ permissions }: { permissions: Permission[] }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const can = (p: Permission) => permissions.includes(p);
  const q = query.trim();

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 w-9 justify-start gap-2 px-2 text-muted-foreground sm:w-56 lg:w-64"
        aria-label="Search and commands"
      >
        <Search />
        <span className="hidden flex-1 text-left font-normal sm:inline">Search…</span>
        <kbd className="pointer-events-none hidden h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          Ctrl K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search and commands" description="Jump to a page or search assets and employees">
        <Command>
          <CommandInput placeholder="Type a page, asset ID, serial or name…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No matching pages.</CommandEmpty>
            {q && (can("asset:read") || can("employee:read")) && (
              <CommandGroup heading="Search">
                {can("asset:read") && (
                  <CommandItem value={`search-assets ${q}`} onSelect={() => go(`/assets?q=${encodeURIComponent(q)}`)}>
                    <Boxes />
                    Assets matching “{q}”
                  </CommandItem>
                )}
                {can("employee:read") && (
                  <CommandItem value={`search-employees ${q}`} onSelect={() => go(`/employees?q=${encodeURIComponent(q)}`)}>
                    <UserRound />
                    Employees matching “{q}”
                  </CommandItem>
                )}
              </CommandGroup>
            )}
            {visibleNav(permissions).map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem key={item.href} value={`${group.label} ${item.title}`} onSelect={() => go(item.href)}>
                    <item.icon />
                    {item.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {can("asset:create") && (
                <CommandItem value="add new asset" onSelect={() => go("/assets/new")}>
                  <Plus />
                  Add asset
                </CommandItem>
              )}
              {can("employee:create") && (
                <CommandItem value="add new employee" onSelect={() => go("/employees/new")}>
                  <Plus />
                  Add employee
                </CommandItem>
              )}
              <CommandItem
                value="toggle theme dark light mode"
                onSelect={() => {
                  setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  setOpen(false);
                }}
              >
                {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
                <CommandShortcut>Theme</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is unknown during server render, so nothing rendered here may depend
  // on it (that caused a hydration mismatch); the icons switch via the `dark:` class.
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
