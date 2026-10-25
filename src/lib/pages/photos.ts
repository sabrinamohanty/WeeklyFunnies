import type { z } from "zod";
import { PAGE_LIMITS, type photoSchema } from "@/lib/contract/pages";
import { getAiService, toApiError } from "@/lib/ai";
import { AiError } from "@/lib/ai/errors";
import { serviceDb } from "@/lib/db/client";
import { unwrap, unwrapMaybe } from "@/lib/db/errors";
import { ApiError } from "@/lib/http/errors";
import { processUpload } from "@/lib/images/process";
import { objectPath, uploadObject } from "@/lib/storage/objects";
import { signUrls } from "@/lib/storage/signed";
import { assertWritable, pageLock, requireAuthor, requireAuthorHighlight } from "./repo";

type Photo = z.input<typeof photoSchema>;

export async function addHighlightPhoto(
  highlightId: string,
  userId: string,
  bytes: Uint8Array,
  requestId: string,
): Promise<Photo> {
  const highlight = await requireAuthorHighlight(highlightId, userId);
  const page = await requireAuthor(highlight.page_id, userId);
  assertWritable((await pageLock(page.id)).locked);

  const existing = unwrap(
    await serviceDb().from("photos").select("id, position").eq("highlight_id", highlightId),
  );
  if (existing.length >= PAGE_LIMITS.photosPerHighlight) throw new ApiError("conflict");
  const used = new Set(existing.map((p) => p.position));
  const position = [0, 1, 2, 3].find((p) => !used.has(p)) ?? 0;

  const image = await processUpload(bytes);
  try {
    await getAiService().checkPhoto(
      { image: { bytes: new Uint8Array(image.bytes), mimeType: image.mimeType } },
      { requestId, userId },
    );
  } catch (err) {
    if (err instanceof AiError) throw toApiError(err);
    throw err;
  }

  const path = objectPath(userId, image.ext);
  await uploadObject("photos", path, image.bytes, image.mimeType);
  const row = unwrap(
    await serviceDb()
      .from("photos")
      .insert({
        highlight_id: highlightId,
        user_id: userId,
        storage_path: path,
        width: image.width,
        height: image.height,
        byte_size: image.bytes.byteLength,
        position,
      })
      .select("id, highlight_id, storage_path, width, height, created_at")
      .single(),
  );
  const urls = await signUrls("photos", [path]);
  const url = urls.get(path);
  if (!url) throw new ApiError("internal");
  return {
    id: row.id,
    highlightId: row.highlight_id,
    url,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

/** Allowed after the deadline and after publishing. Only the author can delete. */
export async function deletePhoto(photoId: string, userId: string): Promise<void> {
  const row = unwrapMaybe(
    await serviceDb().from("photos").select("id, user_id").eq("id", photoId).maybeSingle(),
  );
  if (!row || row.user_id !== userId) throw new ApiError("not_found");
  unwrap(await serviceDb().from("photos").delete().eq("id", photoId).select("id"));
}
