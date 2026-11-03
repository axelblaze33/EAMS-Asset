"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { runDailyChecks } from "@/lib/reminders";
import { ok, runAction, type ActionResult } from "@/lib/action";

/** Marks the caller's own notifications read (all of them when no ids are given). */
export async function markNotificationsRead(input: { ids?: string[] }): Promise<ActionResult> {
  return runAction(async () => {
    const user = await authorize();
    const ids = z.array(z.string().min(1)).max(200).optional().parse(input.ids);
    await db.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(ids && { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
    refresh();
    return ok(undefined);
  });
}

export async function runRemindersNow(): Promise<ActionResult<Awaited<ReturnType<typeof runDailyChecks>>>> {
  return runAction(async () => {
    const actor = await authorize("settings:manage");
    const counts = await runDailyChecks();
    await writeAudit({ actorId: actor.id, action: "system.run_reminders", entityType: "System", entityId: "reminders", summary: "Ran daily reminder checks manually", after: counts });
    refresh();
    return ok(counts, "Reminder checks complete");
  });
}
