import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PNG_BYTES, anonClient, env, objectExists } from "./helpers/db";
import { type World, buildWorld } from "./helpers/world";

let w: World;

beforeAll(async () => {
  w = await buildWorld();
});

afterAll(async () => {
  await w?.cleanup();
});

async function canDownload(client: SupabaseClient, bucket: string, path: string): Promise<boolean> {
  const { data, error } = await client.storage.from(bucket).download(path);
  return error === null && data !== null;
}

async function canSign(client: SupabaseClient, bucket: string, path: string): Promise<boolean> {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60);
  return error === null && Boolean(data?.signedUrl);
}

describe("storage: user B (Ben) cannot reach user A's files", () => {
  it("cannot download or sign Ama's photos, panels, avatar, or selfie", async () => {
    const targets: [string, string][] = [
      ["photos", w.paths.amaDraftPhoto],
      ["photos", w.paths.amaPublishedPhoto],
      ["panels", w.paths.amaDraftPanel],
      ["panels", w.paths.amaPublishedPanel],
      ["avatars", w.paths.amaAvatar],
      ["avatars", w.paths.amaDraftAvatar],
      ["selfies", w.paths.amaSelfie],
    ];
    for (const [bucket, path] of targets) {
      expect(await canDownload(w.ben.client, bucket, path), `download ${bucket}`).toBe(false);
      expect(await canSign(w.ben.client, bucket, path), `sign ${bucket}`).toBe(false);
    }
  });

  it("cannot list paper A's folder", async () => {
    const { data } = await w.ben.client.storage.from("photos").list(`${w.paperA}/${w.ama.id}`);
    expect(data ?? []).toEqual([]);
  });
});

describe("storage: co-member C (Cole) mirrors table visibility", () => {
  it("can read Ama's published photo and panel", async () => {
    expect(await canDownload(w.cole.client, "photos", w.paths.amaPublishedPhoto)).toBe(true);
    expect(await canDownload(w.cole.client, "panels", w.paths.amaPublishedPanel)).toBe(true);
    expect(await canSign(w.cole.client, "photos", w.paths.amaPublishedPhoto)).toBe(true);
  });

  it("cannot read Ama's draft photo or draft panel", async () => {
    expect(await canDownload(w.cole.client, "photos", w.paths.amaDraftPhoto)).toBe(false);
    expect(await canDownload(w.cole.client, "panels", w.paths.amaDraftPanel)).toBe(false);
  });

  it("can read Ama's approved avatar, but not her draft avatar or selfie", async () => {
    expect(await canDownload(w.cole.client, "avatars", w.paths.amaAvatar)).toBe(true);
    expect(await canDownload(w.cole.client, "avatars", w.paths.amaDraftAvatar)).toBe(false);
    expect(await canDownload(w.cole.client, "selfies", w.paths.amaSelfie)).toBe(false);
  });
});

describe("storage: owner A (Ama)", () => {
  it("can read her own draft photo, panel, and avatar", async () => {
    expect(await canDownload(w.ama.client, "photos", w.paths.amaDraftPhoto)).toBe(true);
    expect(await canDownload(w.ama.client, "panels", w.paths.amaDraftPanel)).toBe(true);
    expect(await canDownload(w.ama.client, "avatars", w.paths.amaAvatar)).toBe(true);
  });

  it("cannot read her own selfie (server-only)", async () => {
    expect(await canDownload(w.ama.client, "selfies", w.paths.amaSelfie)).toBe(false);
  });

  it("cannot upload, overwrite, or delete objects directly", async () => {
    for (const bucket of ["photos", "panels", "avatars", "selfies"]) {
      const path =
        bucket === "avatars" || bucket === "selfies"
          ? `${w.ama.id}/direct.png`
          : `${w.paperA}/${w.ama.id}/direct.png`;
      const { error } = await w.ama.client.storage
        .from(bucket)
        .upload(path, PNG_BYTES, { contentType: "image/png" });
      expect(error, `upload ${bucket}`).not.toBeNull();
    }
    const overwrite = await w.ama.client.storage
      .from("photos")
      .upload(w.paths.amaDraftPhoto, PNG_BYTES, { contentType: "image/png", upsert: true });
    expect(overwrite.error).not.toBeNull();

    await w.ama.client.storage.from("photos").remove([w.paths.amaDraftPhoto]);
    expect(await objectExists("photos", w.paths.amaDraftPhoto)).toBe(true);
  });
});

describe("storage: buckets are private", () => {
  it("public URLs don't serve objects", async () => {
    const { url } = env();
    for (const [bucket, path] of [
      ["photos", w.paths.amaPublishedPhoto],
      ["avatars", w.paths.amaAvatar],
    ]) {
      const res = await fetch(`${url}/storage/v1/object/public/${bucket}/${path}`);
      expect(res.ok, bucket).toBe(false);
    }
  });

  it("anon can't download anything", async () => {
    expect(await canDownload(anonClient(), "photos", w.paths.amaPublishedPhoto)).toBe(false);
    expect(await canDownload(anonClient(), "avatars", w.paths.amaAvatar)).toBe(false);
  });
});
