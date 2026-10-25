import { getConfig } from "@/lib/config/env";
import { serviceDb } from "@/lib/db/client";
import { log } from "@/lib/log/logger";

export type Bucket = "selfies" | "avatars" | "panels" | "photos";

/**
 * Creates short-lived signed URLs for many objects in one call. Returns a map from path to URL; paths
 * that can't be signed (for example, missing files) are left out, and the caller shows null.
 * Storage paths themselves are never returned to clients.
 */
export async function signUrls(
  bucket: Bucket,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const { data, error } = await serviceDb()
    .storage.from(bucket)
    .createSignedUrls(unique, getConfig().SIGNED_URL_TTL_SECONDS);
  if (error) {
    log.warn("storage.sign_failed", { bucket, pathCount: unique.length });
    return out;
  }
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) out.set(item.path, item.signedUrl);
  }
  return out;
}

export function urlsExpireAt(): string {
  return new Date(Date.now() + getConfig().SIGNED_URL_TTL_SECONDS * 1000).toISOString();
}
