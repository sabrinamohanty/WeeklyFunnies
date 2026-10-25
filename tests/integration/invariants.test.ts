import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type TestUser, createUser, deleteUsers, serviceClient } from "./helpers/db";
import {
  type World,
  addPhoto,
  buildWorld,
  createEdition,
  createHighlight,
  createPage,
  createPaper,
  linkPage,
  removeObjects,
} from "./helpers/world";

// Invariants enforced by the database for every role, including the service role the API uses.

let w: World;
const extraUsers: TestUser[] = [];
const extraPapers: string[] = [];
const db = () => serviceClient();

beforeAll(async () => {
  w = await buildWorld();
});

afterAll(async () => {
  await db().from("papers").delete().in("id", extraPapers);
  await deleteUsers(extraUsers);
  await w?.cleanup();
});

describe("profiles", () => {
  it("are created automatically for new auth users", async () => {
    const { data } = await db().from("profiles").select("id").eq("id", w.ben.id);
    expect(data).toHaveLength(1);
  });

  it("derive the zodiac sign at the boundaries", async () => {
    const cases: [string, string][] = [
      ["2000-03-20", "pisces"],
      ["2000-03-21", "aries"],
      ["2000-04-19", "aries"],
      ["2000-04-20", "taurus"],
      ["2000-12-21", "sagittarius"],
      ["2000-12-22", "capricorn"],
      ["2001-01-19", "capricorn"],
      ["2001-01-20", "aquarius"],
      ["2000-02-29", "pisces"],
      ["2000-07-23", "leo"],
    ];
    for (const [birthday, sign] of cases) {
      const { data, error } = await db()
        .from("profiles")
        .update({ birthday })
        .eq("id", w.ben.id)
        .select("zodiac_sign")
        .single();
      expect(error).toBeNull();
      expect(data?.zodiac_sign, birthday).toBe(sign);
    }
  });

  it("require city fields to be set together", async () => {
    const { error } = await db().from("profiles").update({ city_name: "Kumasi" }).eq("id", w.ben.id);
    expect(error?.code).toBe("23514");
  });
});

describe("published editions are locked", () => {
  it("rejects new highlights on a published page", async () => {
    await expect(createHighlight(w.amaPublishedPage, w.ama, 1)).rejects.toThrow(/edition_locked/);
  });

  it("rejects content edits, but still lets a panel finish", async () => {
    const edit = await db().from("highlights").update({ text: "changed" }).eq("id", w.amaPublishedHighlight);
    expect(edit.error?.message).toContain("edition_locked");
    const story = await db().from("stories").update({ headline: "changed" }).eq("id", w.amaPublishedStory);
    expect(story.error?.message).toContain("edition_locked");
    const page = await db().from("pages").update({ comic_title: "nope" }).eq("id", w.amaPublishedPage);
    expect(page.error?.message).toContain("edition_locked");
    const panel = await db()
      .from("panels")
      .update({ status: "ready" })
      .eq("page_id", w.amaPublishedPage)
      .eq("idx", 0);
    expect(panel.error).toBeNull();
  });

  it("rejects new photos", async () => {
    await expect(addPhoto(w.amaPublishedHighlight, w.ama, 1)).rejects.toThrow(/edition_locked/);
  });

  it("can't be unpublished", async () => {
    const { error } = await db()
      .from("editions")
      .update({ status: "draft", published_at: null })
      .eq("id", w.publishedA);
    expect(error?.message).toContain("edition_locked");
  });

  it("rejects linking a new page to a published edition", async () => {
    const page = await createPage(w.cole, "2026-10-12");
    await expect(linkPage(page, w.cole, w.paperA, w.publishedA)).rejects.toThrow(/edition_locked/);
    await db().from("pages").delete().eq("id", page);
  });
});

describe("limits and ownership", () => {
  it("caps highlights at 3 per page", async () => {
    await createHighlight(w.coleDraftPage, w.cole, 1);
    await createHighlight(w.coleDraftPage, w.cole, 2);
    await expect(createHighlight(w.coleDraftPage, w.cole, 3)).rejects.toThrow(/check constraint/);
    await expect(createHighlight(w.coleDraftPage, w.cole, 0)).rejects.toThrow(
      /duplicate key|highlights_.*position/,
    );
  });

  it("caps photos at 4 per highlight", async () => {
    const added = [];
    for (const position of [1, 2, 3]) added.push(await addPhoto(w.benDraftHighlight, w.ben, position));
    await expect(addPhoto(w.benDraftHighlight, w.ben, 4)).rejects.toThrow(/check constraint/);
    await removeObjects({ photos: added.map((p) => p.path) });
  });

  it("rejects page links by non-members (Ben posting into paper A)", async () => {
    await expect(linkPage(w.benDraftPage, w.ben, w.paperA, w.draftA)).rejects.toThrow(/foreign key/);
  });

  it("rejects page links whose paper doesn't match the edition", async () => {
    const page = await createPage(w.ben, "2026-09-21");
    await expect(linkPage(page, w.ben, w.paperB, w.draftA)).rejects.toThrow(/foreign key/);
    await db().from("pages").delete().eq("id", page);
  });

  it("rejects photo paths outside the author's folder", async () => {
    const { error } = await db()
      .from("photos")
      .insert({
        highlight_id: w.amaDraftHighlight,
        user_id: w.ama.id,
        storage_path: `${w.ben.id}/${randomUUID()}.png`,
        width: 1,
        height: 1,
        byte_size: 1,
        position: 2,
      });
    expect(error?.code).toBe("23514");
  });

  it("only allows Monday week starts", async () => {
    await expect(createEdition(w.paperB, "2026-10-21")).rejects.toThrow(/check constraint/);
  });

  it("caps papers at 8 members", async () => {
    const owner = await createUser("cap-owner");
    extraUsers.push(owner);
    const paper = await createPaper(owner, "Crowded");
    extraPapers.push(paper);
    const joiners = await Promise.all(Array.from({ length: 8 }, (_, i) => createUser(`cap-${i}`)));
    extraUsers.push(...joiners);
    for (const u of joiners.slice(0, 7)) {
      const { error } = await db().from("paper_members").insert({ paper_id: paper, user_id: u.id });
      expect(error).toBeNull();
    }
    const { error } = await db().from("paper_members").insert({ paper_id: paper, user_id: joiners[7]!.id });
    expect(error?.message).toContain("paper_full");
  });
});

describe("storage deletion outbox", () => {
  it("queues panel and photo files when a page is deleted", async () => {
    const page = await createPage(w.ben, "2026-10-05");
    const highlight = await createHighlight(page, w.ben);
    const photo = await addPhoto(highlight, w.ben, 0);
    const panel = `${w.ben.id}/${randomUUID()}.png`;
    await db().from("panels").insert({
      page_id: page,
      idx: 0,
      user_id: w.ben.id,
      highlight_id: highlight,
      scene: "A quiet panel.",
      storage_path: panel,
      status: "ready",
    });

    await db().from("pages").delete().eq("id", page);
    const { data } = await db()
      .from("storage_deletions")
      .select("bucket, path")
      .in("path", [photo.path, panel])
      .order("bucket");
    expect(data).toEqual([
      { bucket: "panels", path: panel },
      { bucket: "photos", path: photo.path },
    ]);
    await removeObjects({ photos: [photo.path], panels: [panel] });
  });

  it("is idempotent: queuing the same path twice keeps one entry", async () => {
    const path = `${w.ben.id}/${randomUUID()}.png`;
    const page = await createPage(w.ben, "2026-09-28");
    const highlight = await createHighlight(page, w.ben);
    await db().from("panels").insert({
      page_id: page,
      idx: 0,
      user_id: w.ben.id,
      highlight_id: highlight,
      scene: "A quiet panel.",
      storage_path: path,
      status: "ready",
    });
    await db().from("panels").update({ storage_path: null }).eq("page_id", page).eq("idx", 0);
    await db().from("panels").update({ storage_path: path }).eq("page_id", page).eq("idx", 0);
    await db().from("pages").delete().eq("id", page);
    const { data } = await db().from("storage_deletions").select("path").eq("path", path);
    expect(data).toHaveLength(1);
    await removeObjects({ panels: [path] });
  });

  it("on avatar approval, queues the selfie but keeps the promoted avatar", async () => {
    await db().from("profiles").update({ avatar_path: w.paths.amaDraftAvatar }).eq("id", w.ama.id);
    await db().from("avatar_drafts").delete().eq("user_id", w.ama.id);
    const { data } = await db()
      .from("storage_deletions")
      .select("bucket, path")
      .in("path", [w.paths.amaSelfie, w.paths.amaDraftAvatar, w.paths.amaAvatar])
      .order("bucket");
    expect(data).toEqual([
      { bucket: "avatars", path: w.paths.amaAvatar },
      { bucket: "selfies", path: w.paths.amaSelfie },
    ]);
  });
});
