import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, clientWithToken, serviceClient } from "./helpers/db";
import { type World, buildWorld } from "./helpers/world";

let w: World;

beforeAll(async () => {
  w = await buildWorld();
});

afterAll(async () => {
  await w?.cleanup();
});

const ids = (rows: { id: string }[] | null) => (rows ?? []).map((r) => r.id).sort();

describe("user B (Ben) cannot read user A's paper", () => {
  it("sees only his own paper", async () => {
    const { data, error } = await w.ben.client.from("papers").select("id");
    expect(error).toBeNull();
    expect(ids(data)).toEqual([w.paperB]);
  });

  it("gets nothing when asking for paper A by id", async () => {
    for (const [table, column, value] of [
      ["papers", "id", w.paperA],
      ["paper_members", "paper_id", w.paperA],
      ["editions", "paper_id", w.paperA],
      ["events", "paper_id", w.paperA],
      ["photos", "paper_id", w.paperA],
    ] as const) {
      const { data, error } = await w.ben.client.from(table).select(column).eq(column, value);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it("cannot read Ama's events or photos by id (IDOR)", async () => {
    expect((await w.ben.client.from("events").select("id").eq("id", w.amaPublishedEvent)).data).toEqual([]);
    expect((await w.ben.client.from("photos").select("id").eq("id", w.photoIds.amaPublished)).data).toEqual(
      [],
    );
  });

  it("cannot read Ama's profile or invites", async () => {
    expect((await w.ben.client.from("profiles").select("id").eq("id", w.ama.id)).data).toEqual([]);
    expect((await w.ben.client.from("invites").select("id").eq("paper_id", w.paperA)).data).toEqual([]);
  });
});

describe("sensitive columns are never readable directly, even on your own rows", () => {
  it("denies storage paths, source text, birthdays, coordinates, and session state", async () => {
    const c = w.ama.client;
    const denied = [
      await c.from("events").select("source_text").eq("id", w.amaDraftEvent),
      await c.from("events").select("panel_path").eq("id", w.amaDraftEvent),
      await c.from("events").select("panel_spec").eq("id", w.amaDraftEvent),
      await c.from("events").select("*"),
      await c.from("photos").select("storage_path"),
      await c.from("profiles").select("birthday").eq("id", w.ama.id),
      await c.from("profiles").select("lat, lng").eq("id", w.ama.id),
      await c.from("profiles").select("avatar_path").eq("id", w.ama.id),
      await c.from("profiles").select("last_active_at").eq("id", w.ama.id),
    ];
    for (const d of denied) {
      expect(d.error?.code).toBe("42501");
      expect(d.data).toBeNull();
    }
  });
});

describe("co-member C (Cole) in paper A", () => {
  it("sees the paper, its members, and both editions", async () => {
    expect(ids((await w.cole.client.from("papers").select("id")).data)).toEqual([w.paperA]);
    const members = (await w.cole.client.from("paper_members").select("user_id").eq("paper_id", w.paperA))
      .data;
    expect(members?.map((m) => m.user_id).sort()).toEqual([w.ama.id, w.cole.id].sort());
    expect(ids((await w.cole.client.from("editions").select("id")).data)).toEqual(
      [w.draftA, w.publishedA].sort(),
    );
  });

  it("sees Ama's published event and photo, but not her drafts", async () => {
    expect(ids((await w.cole.client.from("events").select("id")).data)).toEqual(
      [w.amaPublishedEvent, w.coleDraftEvent].sort(),
    );
    expect(ids((await w.cole.client.from("photos").select("id")).data)).toEqual([w.photoIds.amaPublished]);
  });

  it("cannot read Ama's profile row (birthday, coordinates) directly", async () => {
    expect((await w.cole.client.from("profiles").select("id").eq("id", w.ama.id)).data).toEqual([]);
  });

  it("cannot see invites, because only owners can", async () => {
    expect((await w.cole.client.from("invites").select("id")).data).toEqual([]);
  });
});

describe("owner A (Ama)", () => {
  it("sees her own drafts and published events", async () => {
    const own = (await w.ama.client.from("events").select("id").eq("user_id", w.ama.id)).data;
    expect(ids(own)).toEqual([w.amaDraftEvent, w.amaPublishedEvent].sort());
  });

  it("does not see Cole's draft", async () => {
    expect((await w.ama.client.from("events").select("id").eq("id", w.coleDraftEvent)).data).toEqual([]);
  });

  it("sees her invites, but never the code hash", async () => {
    expect(ids((await w.ama.client.from("invites").select("id")).data)).toEqual([w.inviteA]);
    const { error } = await w.ama.client.from("invites").select("code_hash");
    expect(error?.code).toBe("42501");
  });

  it("reads her own profile with a derived zodiac sign", async () => {
    await serviceClient().from("profiles").update({ birthday: "1995-03-21" }).eq("id", w.ama.id);
    const { data } = await w.ama.client.from("profiles").select("zodiac_sign").eq("id", w.ama.id).single();
    expect(data?.zodiac_sign).toBe("aries");
  });
});

describe("direct writes are denied (all writes go through the API)", () => {
  it("cannot insert, update, or delete papers, editions, events, or members", async () => {
    const c = w.ama.client;
    const attempts = [
      await c.from("papers").insert({ name: "x", created_by: w.ama.id }),
      await c.from("papers").update({ name: "x" }).eq("id", w.paperA),
      await c.from("editions").update({ status: "published" }).eq("id", w.draftA),
      await c.from("events").update({ headline: "unmoderated", approved: true }).eq("id", w.amaDraftEvent),
      await c.from("events").delete().eq("id", w.amaDraftEvent),
      await c.from("paper_members").insert({ paper_id: w.paperB, user_id: w.ama.id }),
      await c.from("profiles").update({ avatar_path: null }).eq("id", w.ama.id),
      await c.from("horoscopes").insert({ sign: "leo", week_start: "2026-10-19", text: "x" }),
    ];
    for (const a of attempts) expect(a.error?.code).toBe("42501");
  });

  it("cannot touch server-only tables at all", async () => {
    expect((await w.ama.client.from("avatar_drafts").select("*")).error?.code).toBe("42501");
    expect((await w.ama.client.from("storage_deletions").select("*")).error?.code).toBe("42501");
  });

  it("Ben cannot delete Ama's photo", async () => {
    const { data } = await w.ben.client
      .from("photos")
      .delete()
      .eq("id", w.photoIds.amaPublished)
      .select("id");
    expect(data).toEqual([]);
    const still = await serviceClient().from("photos").select("id").eq("id", w.photoIds.amaPublished);
    expect(still.data).toHaveLength(1);
  });
});

describe("anon and bad tokens", () => {
  it("anon reads nothing", async () => {
    for (const table of ["papers", "events", "photos", "profiles", "horoscopes"]) {
      const { data } = await anonClient().from(table).select("*");
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("a tampered token is rejected", async () => {
    const [h, p, s] = w.ama.token.split(".");
    const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
    payload.sub = w.ben.id;
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${s}`;
    const { data, error } = await clientWithToken(forged).from("papers").select("id");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("an expired token is rejected", async () => {
    const [h, p, s] = w.ama.token.split(".");
    const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
    payload.exp = 1;
    const expired = `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${s}`;
    const { data, error } = await clientWithToken(expired).from("papers").select("id");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe("contributors can delete their own photos at any time", () => {
  it("deletes a photo in a published edition and queues its file for removal", async () => {
    const { data, error } = await w.ama.client
      .from("photos")
      .delete()
      .eq("id", w.photoIds.amaPublished)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const queued = await serviceClient()
      .from("storage_deletions")
      .select("bucket, path")
      .eq("path", w.paths.amaPublishedPhoto);
    expect(queued.data).toEqual([{ bucket: "photos", path: w.paths.amaPublishedPhoto }]);
  });
});
