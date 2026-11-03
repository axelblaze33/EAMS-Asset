"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { createSession, deleteSession, readSession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/dal";
import type { Permission } from "@/lib/auth/permissions";
import { loginSchema } from "./schemas";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
// Compared against when the email is unknown, so response time doesn't reveal
// which emails have accounts.
const DUMMY_HASH = "$2b$12$r2h8hvCroB430NrNeik/RuopyphenoTka6cDBg28TIr1x5KOEjmMe";

export type LoginState = { error?: string; email?: string } | undefined;

function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  // Only same-site relative paths; blocks open redirects like //evil.com.
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password.", email: String(formData.get("email") ?? "") };
  }
  const { email, password } = parsed.data;
  const genericError = { error: "Invalid email or password.", email };

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      sessionVersion: true,
      failedLoginCount: true,
      lockedUntil: true,
      role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
    },
  });

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return genericError;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `Too many failed attempts. Try again in ${minutes} minute(s).`, email };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid || !user.isActive) {
    if (!valid) {
      const failed = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED_ATTEMPTS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
        },
      });
    }
    return user.isActive ? genericError : { error: "This account has been deactivated. Contact your administrator.", email };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id, user.sessionVersion);
  await writeAudit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id });

  const permissions = user.role.permissions.map((rp) => rp.permission.key as Permission);
  redirect(safeNext(formData.get("next")) ?? homePathFor({ permissions }));
}

export async function logout() {
  const session = await readSession();
  await deleteSession();
  if (session) {
    await writeAudit({ actorId: session.sub, action: "auth.logout", entityType: "User", entityId: session.sub });
  }
  redirect("/login");
}
