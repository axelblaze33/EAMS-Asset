import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "./session";
import type { Permission } from "./permissions";

// Data Access Layer: the only place that turns a session cookie into a user.
// Every page, server action and route handler goes through these helpers, so
// authorization never depends on what the UI chose to show.

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  employeeId: string | null;
  permissions: Permission[];
};

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Resolves the signed-in user once per request, or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      sessionVersion: true,
      employeeId: true,
      role: {
        select: {
          key: true,
          name: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });

  // Deactivated users and sessions issued before a password reset are rejected.
  if (!user || !user.isActive || user.sessionVersion !== session.ver) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKey: user.role.key,
    roleName: user.role.name,
    employeeId: user.employeeId,
    permissions: user.role.permissions.map((rp) => rp.permission.key as Permission),
  };
});

export function hasPermission(user: CurrentUser | null, ...required: Permission[]) {
  if (!user) return false;
  return required.every((p) => user.permissions.includes(p));
}

export function hasAnyPermission(user: CurrentUser | null, ...anyOf: Permission[]) {
  if (!user) return false;
  return anyOf.some((p) => user.permissions.includes(p));
}

/** For pages and layouts: redirects to /login when signed out. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirects to /forbidden when the permission is missing. */
export async function requirePagePermission(...required: Permission[]) {
  const user = await requireUser();
  if (!hasPermission(user, ...required)) redirect("/forbidden");
  return user;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function authorize(...required: Permission[]) {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Your session has expired. Please sign in again.");
  if (!hasPermission(user, ...required)) throw new AuthorizationError();
  return user;
}

/** Where a user should land after sign-in, based on what they can see. */
export function homePathFor(user: Pick<CurrentUser, "permissions">) {
  if (user.permissions.includes("dashboard:read")) return "/dashboard";
  if (user.permissions.includes("asset:read")) return "/assets";
  if (user.permissions.includes("employee:read")) return "/employees";
  return "/forbidden";
}
