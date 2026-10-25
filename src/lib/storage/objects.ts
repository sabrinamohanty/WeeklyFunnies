import { serviceDb } from "@/lib/db/client";
import { ApiError } from "@/lib/http/errors";
import { log } from "@/lib/log/logger";
import type { Bucket } from "./signed";

export async function uploadObject(
  bucket: Bucket,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await serviceDb().storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw new ApiError("internal", { cause: error });
}

export async function downloadObject(bucket: Bucket, path: string): Promise<Uint8Array | null> {
  const { data, error } = await serviceDb().storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Deletes one object. A missing object counts as deleted. Other failures are logged without the path. */
export async function removeObject(bucket: Bucket, path: string): Promise<boolean> {
  const { error } = await serviceDb().storage.from(bucket).remove([path]);
  if (!error) return true;
  const missing = error.message.toLowerCase().includes("not found");
  if (!missing) log.warn("storage.remove_failed", { bucket });
  return missing;
}

export function objectPath(userId: string, ext: string): string {
  return `${userId}/${crypto.randomUUID()}.${ext}`;
}
