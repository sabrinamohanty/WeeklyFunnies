import { getConfig } from "@/lib/config/env";
import { serviceDb } from "@/lib/db/client";
import { unwrap } from "@/lib/db/errors";
import { ApiError } from "@/lib/http/errors";
import { log } from "@/lib/log/logger";

/**
 * Revokes every session, then records when the purge may run.
 * The revoke happens first: if it fails, the token is still valid and a later request would
 * clear `logged_out_at`, so the purge must not be scheduled.
 */
export async function logOutEverywhere(
  userId: string,
  accessToken: string,
  now = new Date(),
): Promise<string> {
  const { error } = await serviceDb().auth.admin.signOut(accessToken, "global");
  if (error) {
    log.warn("retention.sign_out_failed", { userId });
    throw new ApiError("internal");
  }
  unwrap(
    await serviceDb()
      .from("profiles")
      .update({ logged_out_at: now.toISOString() })
      .eq("id", userId)
      .select("id")
      .single(),
  );
  const hours = getConfig().RETENTION_LOGOUT_GRACE_HOURS;
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}
