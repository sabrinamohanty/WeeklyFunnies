import { serviceDb } from "@/lib/db/client";
import { unwrap, unwrapMaybe } from "@/lib/db/errors";
import { log } from "@/lib/log/logger";

const ACTIVITY_GAP_MS = 60 * 60 * 1000;

/**
 * Refreshes the sliding window, at most once an hour, and clears a pending logout purge.
 * Failures are logged and swallowed so a bookkeeping error never rejects a signed-in request.
 */
export async function noteActivity(userId: string, now = new Date()): Promise<void> {
  try {
    const row = unwrapMaybe(
      await serviceDb()
        .from("profiles")
        .select("last_active_at, logged_out_at")
        .eq("id", userId)
        .maybeSingle(),
    );
    if (!row) return;
    const fresh = now.getTime() - new Date(row.last_active_at).getTime() < ACTIVITY_GAP_MS;
    if (fresh && row.logged_out_at === null) return;
    unwrap(
      await serviceDb()
        .from("profiles")
        .update({ last_active_at: now.toISOString(), logged_out_at: null })
        .eq("id", userId)
        .select("id")
        .single(),
    );
  } catch {
    log.warn("retention.activity_failed", { userId });
  }
}
