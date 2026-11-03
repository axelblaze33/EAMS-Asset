import {
  ArrowRightLeft,
  Boxes,
  ClipboardList,
  Database,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  ScrollText,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Shown when the user has ANY of these. Purely cosmetic: pages enforce access themselves. */
  anyOf: Permission[];
};

export type NavGroup = { label: string; items: NavItem[] };

// Modules are added here as each delivery phase ships.
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, anyOf: ["dashboard:read"] },
    ],
  },
  {
    label: "Inventory",
    items: [
      { title: "Assets", href: "/assets", icon: Boxes, anyOf: ["asset:read"] },
      { title: "Assignments", href: "/assignments", icon: ArrowRightLeft, anyOf: ["assignment:read"] },
      { title: "Employees", href: "/employees", icon: UserRound, anyOf: ["employee:read"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Maintenance", href: "/maintenance", icon: Wrench, anyOf: ["maintenance:read"] },
      { title: "Requests", href: "/requests", icon: ClipboardList, anyOf: ["request:read"] },
      { title: "Exit Clearance", href: "/clearance", icon: LogOut, anyOf: ["clearance:read"] },
      { title: "Reports", href: "/reports", icon: FileBarChart, anyOf: ["report:read"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Master Data", href: "/settings/master-data", icon: Database, anyOf: ["master:manage"] },
      { title: "Users", href: "/settings/users", icon: Users, anyOf: ["user:manage"] },
      { title: "Roles & Permissions", href: "/settings/roles", icon: ShieldCheck, anyOf: ["role:manage"] },
      { title: "Audit Log", href: "/settings/audit", icon: ScrollText, anyOf: ["audit:read"] },
    ],
  },
];

export function visibleNav(permissions: Permission[]) {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.anyOf.some((p) => permissions.includes(p))),
  })).filter((group) => group.items.length > 0);
}
