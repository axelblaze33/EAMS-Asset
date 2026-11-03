import { timingSafeEqual } from "node:crypto";
import { runDailyChecks } from "@/lib/reminders";

// Called by Vercel Cron (see vercel.json), which sends
// "Authorization: Bearer $CRON_SECRET". Excluded from the login proxy.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const authorized =
    !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const counts = await runDailyChecks();
  return Response.json({ ok: true, ranAt: new Date().toISOString(), counts });
}
