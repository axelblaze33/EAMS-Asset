"use server";

import bcrypt from "bcryptjs";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { SYSTEM_ROLES } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";
import type { Prisma } from "@/generated/prisma/client";
import {
  createUserSchema,
  resetPasswordSchema,
  setActiveSchema,
  updateUserSchema,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
} from "./schemas";

const BCRYPT_ROUNDS = 12;

type Tx = Prisma.TransactionClient;

/** Blocks any change that would leave the system without an active Super Admin. */
async function assertKeepsASuperAdmin(tx: Tx, userId: string, change: { roleId?: string; active?: boolean }) {
  const target = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isActive: true, role: { select: { key: true } } },
  });
  if (target.role.key !== SYSTEM_ROLES.SUPER_ADMIN || !target.isActive) return;

  const staysSuperAdmin =
    change.active !== false &&
    (change.roleId === undefined ||
      (await tx.role.findUnique({ where: { id: change.roleId }, select: { key: true } }))?.key ===
        SYSTEM_ROLES.SUPER_ADMIN);
  if (staysSuperAdmin) return;

  const others = await tx.user.count({
    where: { id: { not: userId }, isActive: true, role: { key: SYSTEM_ROLES.SUPER_ADMIN } },
  });
  if (others === 0) throw new ActionError("At least one active Super Admin is required.");
}

async function assertEmployeeLinkable(tx: Tx, employeeId: string | null | undefined, userId?: string) {
  if (!employeeId) return;
  const employee = await tx.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: { user: { select: { id: true } } },
  });
  if (!employee) throw new ActionError("That employee record no longer exists.");
  if (employee.user && employee.user.id !== userId) {
    throw new ActionError("That employee is already linked to another login.");
  }
}

export async function createUser(input: CreateUserInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await authorize("user:manage");
    const data = createUserSchema.parse(input);
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const user = await db.$transaction(async (tx) => {
      await assertEmployeeLinkable(tx, data.employeeId);
      const created = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          roleId: data.roleId,
          employeeId: data.employeeId ?? null,
          passwordHash,
        },
        select: { id: true, email: true, roleId: true, employeeId: true },
      });
      await writeAudit(
        { actorId: actor.id, action: "user.create", entityType: "User", entityId: created.id, summary: `Created user ${created.email}`, after: created },
        tx,
      );
      return created;
    });

    refresh();
    return ok({ id: user.id }, "User created");
  });
}

export async function updateUser(input: UpdateUserInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("user:manage");
    const data = updateUserSchema.parse(input);

    await db.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: data.id },
        select: { name: true, roleId: true, employeeId: true },
      });
      await assertKeepsASuperAdmin(tx, data.id, { roleId: data.roleId });
      await assertEmployeeLinkable(tx, data.employeeId, data.id);
      const after = await tx.user.update({
        where: { id: data.id },
        data: { name: data.name, roleId: data.roleId, employeeId: data.employeeId ?? null },
        select: { name: true, roleId: true, employeeId: true },
      });
      await writeAudit(
        { actorId: actor.id, action: "user.update", entityType: "User", entityId: data.id, before, after },
        tx,
      );
    });

    refresh();
    return ok(undefined, "User updated");
  });
}

export async function setUserActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("user:manage");
    const data = setActiveSchema.parse(input);
    if (data.id === actor.id && !data.active) throw new ActionError("You can't deactivate your own account.");

    await db.$transaction(async (tx) => {
      await assertKeepsASuperAdmin(tx, data.id, { active: data.active });
      await tx.user.update({
        where: { id: data.id },
        // Bumping the version signs the user out of every device immediately.
        data: { isActive: data.active, sessionVersion: { increment: data.active ? 0 : 1 } },
      });
      await writeAudit(
        { actorId: actor.id, action: data.active ? "user.activate" : "user.deactivate", entityType: "User", entityId: data.id },
        tx,
      );
    });

    refresh();
    return ok(undefined, data.active ? "User reactivated" : "User deactivated");
  });
}

export async function resetUserPassword(input: ResetPasswordInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("user:manage");
    const data = resetPasswordSchema.parse(input);
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: data.id },
        data: { passwordHash, sessionVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null },
      });
      await writeAudit(
        { actorId: actor.id, action: "user.reset_password", entityType: "User", entityId: data.id },
        tx,
      );
    });

    return ok(undefined, "Password reset. The user has been signed out everywhere.");
  });
}
