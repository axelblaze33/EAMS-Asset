"use server";

import { refresh } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";
import { employeeSchema, type EmployeeFormValues } from "./schemas";

type Tx = Prisma.TransactionClient;

async function assertManagerValid(tx: Tx, employeeId: string | null, managerId: string | null) {
  if (!managerId) return;
  if (managerId === employeeId) throw new ActionError("An employee can't report to themselves.");
  // Walk up the chain to stop A → B → A loops.
  let cursor: string | null = managerId;
  for (let depth = 0; cursor && depth < 50; depth++) {
    const m: { managerId: string | null } | null = await tx.employee.findUnique({ where: { id: cursor }, select: { managerId: true } });
    if (!m) throw new ActionError("The selected reporting manager doesn't exist.");
    if (employeeId && m.managerId === employeeId) throw new ActionError("That manager already reports to this employee.");
    cursor = m.managerId;
  }
}

export async function saveEmployee(input: { id?: string | null; values: EmployeeFormValues }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await authorize(input.id ? "employee:update" : "employee:create");
    const data = employeeSchema.parse(input.values);

    const saved = await db.$transaction(async (tx) => {
      await assertManagerValid(tx, input.id ?? null, data.managerId);

      if (input.id) {
        const before = await tx.employee.findFirst({ where: { id: input.id, deletedAt: null } });
        if (!before) throw new ActionError("This employee no longer exists.");
        if (data.employmentStatus === "EXITED" && before.employmentStatus !== "EXITED") {
          const holding = await tx.assetAssignment.count({ where: { employeeId: input.id, status: "ACTIVE" } });
          if (holding > 0) {
            throw new ActionError(`This employee still holds ${holding} asset(s). Use Exit Clearance to collect them, or return them first.`);
          }
        }
        const after = await tx.employee.update({
          where: { id: input.id },
          data: { ...data, exitDate: data.employmentStatus === "EXITED" ? (before.exitDate ?? new Date()) : null },
        });
        await writeAudit({ actorId: actor.id, action: "employee.update", entityType: "Employee", entityId: after.id, summary: `Updated ${after.fullName}`, before, after }, tx);
        return after;
      }

      const created = await tx.employee.create({ data });
      await writeAudit({ actorId: actor.id, action: "employee.create", entityType: "Employee", entityId: created.id, summary: `Added ${created.fullName} (${created.employeeCode})`, after: created }, tx);
      return created;
    });

    refresh();
    return ok({ id: saved.id }, input.id ? "Employee updated" : "Employee added");
  });
}
