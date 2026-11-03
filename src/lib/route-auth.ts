import "server-only";
import { AuthorizationError, authorize } from "@/lib/auth/dal";
import type { Permission } from "@/lib/auth/permissions";

/** Route-handler guard: returns the user, or a 401/403 Response to return as-is. */
export async function authorizeRoute(...required: Permission[]) {
  try {
    return { user: await authorize(...required), denied: null };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const status = err.message.includes("session") ? 401 : 403;
      return { user: null, denied: Response.json({ error: err.message }, { status }) };
    }
    throw err;
  }
}
