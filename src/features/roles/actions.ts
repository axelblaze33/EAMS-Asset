"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { ALL_PERMISSIONS, SYSTEM_ROLES, type Permission } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";

const schema = z.object({
  changes: z
    .array(
      z.object({
        roleId: z.string().min(1),
        permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])),
      }),
    )
    .min(1),
});

export async function saveRolePermissions(input: z.input<typeof schema>): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("role:manage");
    const { changes } = schema.parse(input);

    await db.$transaction(async (tx) => {
      const permissionRows = await tx.permission.findMany({ select: { id: true, key: true } });
      const idByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

      for (const change of changes) {
        const role = await tx.role.findUniqueOrThrow({
          where: { id: change.roleId },
          select: { id: true, key: true, name: true, permissions: { select: { permission: { select: { key: true } } } } },
        });
        // Super Admin always holds every permission, so nobody can lock themselves out.
        if (role.key === SYSTEM_ROLES.SUPER_ADMIN) {
          throw new ActionError("The Super Admin role always has every permission and can't be edited.");
        }

        const before = role.permissions.map((rp) => rp.permission.key).sort();
        const after = [...new Set(change.permissions)].sort();

        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({
          data: after.map((key) => ({ roleId: role.id, permissionId: idByKey.get(key)! })),
        });
        await writeAudit(
          {
            actorId: actor.id,
            action: "role.update_permissions",
            entityType: "Role",
            entityId: role.id,
            summary: `Updated permissions for ${role.name}`,
            before,
            after,
          },
          tx,
        );
      }
    });

    refresh();
    return ok(undefined, "Permissions saved");
  });
}
