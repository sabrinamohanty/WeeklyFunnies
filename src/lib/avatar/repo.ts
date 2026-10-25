import type { z } from "zod";
import type { StyleKey } from "@/lib/contract/common";
import {
  avatarTraitsSchema,
  type avatarStateSchema,
  type createAvatarResponseSchema,
  type AvatarTraits,
} from "@/lib/contract/profile";
import { getConfig } from "@/lib/config/env";
import { getAiService, styleConfig, toApiError } from "@/lib/ai";
import { AiError } from "@/lib/ai/errors";
import { serviceDb } from "@/lib/db/client";
import { unwrap, unwrapMaybe } from "@/lib/db/errors";
import { ApiError } from "@/lib/http/errors";
import { processUpload } from "@/lib/images/process";
import { downloadObject, objectPath, uploadObject } from "@/lib/storage/objects";
import { signUrls } from "@/lib/storage/signed";

type AvatarState = z.input<typeof avatarStateSchema>;
type CreateAvatar = z.input<typeof createAvatarResponseSchema>;

async function ai<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AiError) throw toApiError(err);
    throw err;
  }
}

function traitsOf(raw: unknown): AvatarTraits | null {
  const parsed = avatarTraitsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function isOurSelfieUrl(url: string, selfiePath: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(getConfig().SUPABASE_URL);
    if (parsed.origin !== base.origin) return false;
    const expected = `/storage/v1/object/sign/selfies/${selfiePath}`;
    return parsed.pathname === expected || decodeURIComponent(parsed.pathname) === expected;
  } catch {
    return false;
  }
}

export async function getAvatarState(userId: string): Promise<AvatarState> {
  const profile = unwrap(
    await serviceDb().from("profiles").select("style, look, avatar_path").eq("id", userId).single(),
  );
  const draft = unwrapMaybe(
    await serviceDb().from("avatar_drafts").select("tweaks").eq("user_id", userId).maybeSingle(),
  );
  const urls = await signUrls("avatars", [profile.avatar_path]);
  return {
    style: profile.style as StyleKey,
    look: profile.look,
    traits: traitsOf(draft?.tweaks),
    avatarUrl: profile.avatar_path ? (urls.get(profile.avatar_path) ?? null) : null,
  };
}

export async function uploadAvatarPhoto(
  userId: string,
  bytes: Uint8Array,
  consent: string,
  requestId: string,
): Promise<{ photoUrl: string; expiresAt: string }> {
  if (consent !== "true") {
    throw new ApiError("bad_request", { details: [{ path: "body.photoConsent", issue: "invalid_literal" }] });
  }
  const image = await processUpload(bytes);
  await ai(() =>
    getAiService().checkPhoto(
      { image: { bytes: new Uint8Array(image.bytes), mimeType: image.mimeType } },
      { requestId, userId },
    ),
  );

  const path = objectPath(userId, image.ext);
  await uploadObject("selfies", path, image.bytes, image.mimeType);
  const expiresAt = new Date(Date.now() + getConfig().SELFIE_MAX_AGE_MINUTES * 60_000).toISOString();
  const existing = unwrapMaybe(
    await serviceDb().from("avatar_drafts").select("user_id").eq("user_id", userId).maybeSingle(),
  );
  if (existing) {
    unwrap(
      await serviceDb()
        .from("avatar_drafts")
        .update({ selfie_path: path, selfie_expires_at: expiresAt, status: "pending", error: null })
        .eq("user_id", userId)
        .select("user_id")
        .single(),
    );
  } else {
    unwrap(
      await serviceDb()
        .from("avatar_drafts")
        .insert({ user_id: userId, selfie_path: path, selfie_expires_at: expiresAt, status: "pending" })
        .select("user_id")
        .single(),
    );
  }
  const urls = await signUrls("selfies", [path]);
  const photoUrl = urls.get(path);
  if (!photoUrl) throw new ApiError("internal");
  return { photoUrl, expiresAt };
}

export async function createAvatar(
  userId: string,
  input: { style?: StyleKey; traits?: AvatarTraits; photoUrl?: string },
  requestId: string,
): Promise<CreateAvatar> {
  if (input.style) {
    unwrap(
      await serviceDb()
        .from("profiles")
        .update({ style: input.style })
        .eq("id", userId)
        .select("id")
        .single(),
    );
  }
  const profile = unwrap(await serviceDb().from("profiles").select("style, look").eq("id", userId).single());
  const draft = unwrapMaybe(
    await serviceDb()
      .from("avatar_drafts")
      .select("selfie_path, selfie_expires_at, tweaks")
      .eq("user_id", userId)
      .maybeSingle(),
  );

  if (input.photoUrl) {
    const path = draft?.selfie_path;
    const fresh = path && draft.selfie_expires_at && new Date(draft.selfie_expires_at).getTime() > Date.now();
    if (!path || !fresh || !isOurSelfieUrl(input.photoUrl, path)) throw new ApiError("forbidden");
  }

  let look = profile.look;
  if (input.traits) {
    const described = await ai(() =>
      getAiService().describeLook({ traits: input.traits! }, { requestId, userId }),
    );
    look = described.look;
    if (draft) {
      unwrap(
        await serviceDb()
          .from("avatar_drafts")
          .update({ tweaks: JSON.parse(JSON.stringify(input.traits)) })
          .eq("user_id", userId)
          .select("user_id")
          .single(),
      );
    } else {
      unwrap(
        await serviceDb()
          .from("avatar_drafts")
          .insert({
            user_id: userId,
            selfie_expires_at: new Date(
              Date.now() + getConfig().SELFIE_MAX_AGE_MINUTES * 60_000,
            ).toISOString(),
            tweaks: JSON.parse(JSON.stringify(input.traits)),
            status: "pending",
          })
          .select("user_id")
          .single(),
      );
    }
  }
  if (!look)
    throw new ApiError("bad_request", { details: [{ path: "body.traits", issue: "look_required" }] });

  let photo: { bytes: Uint8Array; mimeType: "image/jpeg" | "image/png" } | undefined;
  if (input.photoUrl) {
    const path = draft?.selfie_path;
    const fresh = path && draft.selfie_expires_at && new Date(draft.selfie_expires_at).getTime() > Date.now();
    if (!path || !fresh || !isOurSelfieUrl(input.photoUrl, path)) throw new ApiError("forbidden");
    const bytes = await downloadObject("selfies", path);
    if (!bytes) throw new ApiError("not_found");
    photo = {
      bytes,
      mimeType: (path.endsWith(".jpg") ? "image/jpeg" : "image/png") as "image/jpeg" | "image/png",
    };
  }

  const style = profile.style as StyleKey;
  await serviceDb().from("avatar_drafts").update({ status: "generating", error: null }).eq("user_id", userId);

  try {
    const image = await ai(() =>
      getAiService().generateAvatar({ look, photo, style: styleConfig(style) }, { requestId, userId }),
    );
    const ext = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
    const path = objectPath(userId, ext);
    await uploadObject("avatars", path, image.bytes, image.mimeType);
    unwrap(
      await serviceDb()
        .from("profiles")
        .update({ look, avatar_path: path, style })
        .eq("id", userId)
        .select("id")
        .single(),
    );
    await serviceDb()
      .from("avatar_drafts")
      .update({ status: "ready", draft_path: path, error: null })
      .eq("user_id", userId);
    const urls = await signUrls("avatars", [path]);
    const avatarUrl = urls.get(path);
    if (!avatarUrl) throw new ApiError("internal");
    return { avatarUrl, style, look };
  } catch (err) {
    await serviceDb()
      .from("avatar_drafts")
      .update({ status: "failed", error: "generation_failed" })
      .eq("user_id", userId);
    throw err;
  }
}
