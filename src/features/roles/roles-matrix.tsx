"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS, permissionModule, type Permission } from "@/lib/auth/permissions";
import { saveRolePermissions } from "./actions";

export type RoleColumn = {
  id: string;
  key: string;
  name: string;
  userCount: number;
  locked: boolean;
  permissions: Permission[];
};

const MODULE_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  user: "System",
  role: "System",
  settings: "System",
  audit: "System",
  master: "Master data",
  asset: "Assets",
  employee: "Employees",
  assignment: "Assignments & returns",
  maintenance: "Maintenance",
  request: "Asset requests",
  clearance: "Exit clearance",
  report: "Reports",
};

export function RolesMatrix({ roles }: { roles: RoleColumn[] }) {
  const initial = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])),
    [roles],
  );
  const [grants, setGrants] = useState<Record<string, Set<Permission>>>(initial);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const key of Object.keys(PERMISSIONS) as Permission[]) {
      const label = MODULE_LABEL[permissionModule(key)] ?? permissionModule(key);
      map.set(label, [...(map.get(label) ?? []), key]);
    }
    return [...map.entries()];
  }, []);

  const dirtyRoles = roles.filter((r) => {
    const a = initial[r.id]!;
    const b = grants[r.id]!;
    return a.size !== b.size || [...a].some((p) => !b.has(p));
  });

  function toggle(roleId: string, permission: Permission, checked: boolean) {
    setGrants((prev) => {
      const next = new Set(prev[roleId]);
      if (checked) next.add(permission);
      else next.delete(permission);
      return { ...prev, [roleId]: next };
    });
  }

  function save() {
    startTransition(async () => {
      const result = await saveRolePermissions({
        changes: dirtyRoles.map((r) => ({ roleId: r.id, permissions: [...grants[r.id]!] })),
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {dirtyRoles.length
            ? `Unsaved changes to ${dirtyRoles.map((r) => r.name).join(", ")}.`
            : "Changes apply to every user with that role on their next page load."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!dirtyRoles.length || pending} onClick={() => setGrants(initial)}>
            <RotateCcw />
            Discard
          </Button>
          <Button disabled={!dirtyRoles.length || pending} onClick={save}>
            {pending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-64 pl-4">Permission</TableHead>
              {roles.map((r) => (
                <TableHead key={r.id} className="text-center">
                  <div className="flex flex-col items-center gap-0.5 py-1">
                    <span className="flex items-center gap-1">
                      {r.locked && <Lock className="size-3" aria-label="Locked" />}
                      {r.name}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {r.userCount} user{r.userCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(([label, keys]) => (
              <GroupRows key={label} label={label} keys={keys} roles={roles} grants={grants} onToggle={toggle} disabled={pending} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function GroupRows({
  label,
  keys,
  roles,
  grants,
  onToggle,
  disabled,
}: {
  label: string;
  keys: Permission[];
  roles: RoleColumn[];
  grants: Record<string, Set<Permission>>;
  onToggle: (roleId: string, permission: Permission, checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={roles.length + 1} className="pl-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </TableCell>
      </TableRow>
      {keys.map((key) => (
        <TableRow key={key}>
          <TableCell className="pl-4">
            <div className="font-medium">{PERMISSIONS[key]}</div>
            <div className="font-mono text-xs text-muted-foreground">{key}</div>
          </TableCell>
          {roles.map((r) => (
            <TableCell key={r.id} className="text-center">
              <Checkbox
                checked={grants[r.id]!.has(key)}
                disabled={r.locked || disabled}
                onCheckedChange={(checked) => onToggle(r.id, key, checked === true)}
                aria-label={`${r.name}: ${PERMISSIONS[key]}`}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
