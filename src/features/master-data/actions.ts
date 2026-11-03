"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { ActionError, ok, runAction, type ActionResult } from "@/lib/action";
import { MASTER, MASTER_ENTITIES, displayField, type MasterEntity } from "./config";
import { ENTITY_TYPE, delegate } from "./delegates";

const entitySchema = z.enum(MASTER_ENTITIES as [MasterEntity, ...MasterEntity[]]);

export async function saveMasterRecord(input: {
  entity: MasterEntity;
  id?: string | null;
  values: Record<string, unknown>;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await authorize("master:manage");
    const entity = entitySchema.parse(input.entity);
    const data = MASTER[entity].schema.parse(input.values);

    const saved = await db.$transaction(async (tx) => {
      const model = delegate(entity, tx);
      if (input.id) {
        const before = await model.findUnique({ where: { id: input.id } });
        if (!before) throw new ActionError("This record no longer exists.");
        const after = await model.update({ where: { id: input.id }, data });
        await writeAudit({ actorId: actor.id, action: `${ENTITY_TYPE[entity].toLowerCase()}.update`, entityType: ENTITY_TYPE[entity], entityId: after.id, before, after }, tx);
        return after;
      }
      const created = await model.create({ data });
      await writeAudit(
        { actorId: actor.id, action: `${ENTITY_TYPE[entity].toLowerCase()}.create`, entityType: ENTITY_TYPE[entity], entityId: created.id, summary: `Created ${MASTER[entity].singular} ${String(created[displayField(entity)])}`, after: created },
        tx,
      );
      return created;
    });

    refresh();
    return ok({ id: saved.id }, input.id ? "Saved" : `${capitalize(MASTER[entity].singular)} added`);
  });
}

export async function setMasterArchived(input: { entity: MasterEntity; id: string; archived: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await authorize("master:manage");
    const entity = entitySchema.parse(input.entity);

    await db.$transaction(async (tx) => {
      const model = delegate(entity, tx);
      const row = await model.findUnique({ where: { id: input.id } });
      if (!row) throw new ActionError("This record no longer exists.");
      // Archiving only hides it from pickers; existing employees/assets keep the link.
      await model.update({ where: { id: input.id }, data: { deletedAt: input.archived ? new Date() : null } });
      await writeAudit(
        { actorId: actor.id, action: `${ENTITY_TYPE[entity].toLowerCase()}.${input.archived ? "archive" : "restore"}`, entityType: ENTITY_TYPE[entity], entityId: input.id },
        tx,
      );
    });

    refresh();
    return ok(undefined, input.archived ? "Archived" : "Restored");
  });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
