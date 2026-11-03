"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  assets: "Assets",
  employees: "Employees",
  assignments: "Assignments",
  returns: "Returns",
  maintenance: "Maintenance",
  requests: "Requests",
  reports: "Reports",
  clearance: "Exit Clearance",
  notifications: "Notifications",
  audit: "Audit Log",
  "asset-history": "Asset history",
  inventory: "Inventory",
  available: "Available",
  assigned: "Assigned",
  damaged: "Damaged",
  warranty: "Warranty",
  "employee-allocation": "Employee allocation",
  department: "Departments",
  "exit-clearance": "Exit clearance",
  "assignment-history": "Assignment history",
  procurement: "Procurement",
  depreciation: "Depreciation",
  settings: "Settings",
  "master-data": "Master Data",
  users: "Users",
  roles: "Roles & Permissions",
  new: "New",
  edit: "Edit",
  label: "Label",
  return: "Return",
  handover: "Handover",
  forbidden: "Access denied",
};

// Intermediate segments that have no page of their own render as plain text.
const NO_PAGE = [/^\/settings$/, /^\/assignments\/handover$/, /^\/assignments\/[^/]+$/];

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => ({
    href: "/" + segments.slice(0, i + 1).join("/"),
    // Record ids (cuid) read as "Details".
    label: LABELS[seg] ?? (/^c[a-z0-9]{20,}$/.test(seg) ? "Details" : decodeURIComponent(seg)),
  }));

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
              {last || NO_PAGE.some((re) => re.test(c.href)) ? (
                <span className={last ? "truncate font-medium text-foreground" : "truncate text-muted-foreground"} aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
