"use client";

import { useMemo, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { KeyRound, MoreHorizontal, Pencil, Plus, Search, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";
import { TONE_CLASS } from "@/lib/labels";
import type { Option } from "@/components/shared/form-fields";
import { setUserActive } from "./actions";
import type { EmployeeOption, UserRow } from "./queries";
import { UserFormDialog } from "./user-form-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

export function UsersTable({
  users,
  roles,
  employees,
  currentUserId,
}: {
  users: UserRow[];
  roles: Option[];
  employees: EmployeeOption[];
  currentUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [toggling, setToggling] = useState<UserRow | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.name, u.email, u.role.name, u.employee?.employeeCode].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [users, query]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function confirmToggle() {
    if (!toggling) return;
    const target = toggling;
    startTransition(async () => {
      const result = await setUserActive({ id: target.id, active: !target.isActive });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      setToggling(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, role…"
            className="pl-8"
            aria-label="Search users"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Create user
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Employee</TableHead>
              <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No users match “{query}”.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((u) => {
              const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
              return (
                <TableRow key={u.id} className={cn(!u.isActive && "opacity-60")}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {u.name}
                          {u.id === currentUserId && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{u.role.name}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {u.employee ? (
                      <span>
                        {u.employee.fullName}{" "}
                        <span className="font-mono text-xs text-muted-foreground">{u.employee.employeeCode}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : "Never"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                        TONE_CLASS[!u.isActive ? "muted" : locked ? "danger" : "success"],
                      )}
                    >
                      {!u.isActive ? "Deactivated" : locked ? "Locked" : "Active"}
                    </span>
                  </TableCell>
                  <TableCell className="pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`} />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-44">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(u);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setResetting(u)}>
                          <KeyRound />
                          Reset password
                        </DropdownMenuItem>
                        {u.id !== currentUserId && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant={u.isActive ? "destructive" : "default"}
                              onClick={() => setToggling(u)}
                            >
                              {u.isActive ? <UserX /> : <UserCheck />}
                              {u.isActive ? "Deactivate" : "Reactivate"}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} roles={roles} employees={employees} />
      <ResetPasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} />

      <AlertDialog open={!!toggling} onOpenChange={(open) => !open && setToggling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggling?.isActive ? "Deactivate" : "Reactivate"} {toggling?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.isActive
                ? "They will be signed out immediately and won't be able to sign in until reactivated. Their history is kept."
                : "They will be able to sign in again with their existing password."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={toggling?.isActive ? "destructive" : "default"}
              onClick={confirmToggle}
              disabled={pending}
            >
              {toggling?.isActive ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
