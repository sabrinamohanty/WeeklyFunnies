import { serviceDb } from "@/lib/db/client";
import { ApiError } from "@/lib/http/errors";
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

export function objectPath(userId: string, ext: string): string {
  return `${userId}/${crypto.randomUUID()}.${ext}`;
}
