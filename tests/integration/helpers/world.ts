import { randomUUID } from "node:crypto";
import {
  type TestUser,
  MONDAY,
  PREVIOUS_MONDAY,
  createUser,
  deleteUsers,
  inDays,
  must,
  serviceClient,
  upload,
} from "./db";

/**
 * Two papers and three users:
 * - Paper A: Ama (owner) and Cole (member). One draft edition and one published edition.
 * - Paper B: Ben (owner). One draft edition.
 * Ama has a page (with highlight, photo, story, and panel) in each of paper A's editions, an
 * approved avatar, and an in-progress avatar draft with a retained selfie. Cole has a draft page
 * in paper A.
 */
export interface World {
  ama: TestUser;
  ben: TestUser;
  cole: TestUser;
  paperA: string;
  paperB: string;
  draftA: string;
  publishedA: string;
  draftB: string;
  amaDraftPage: string;
  amaPublishedPage: string;
  coleDraftPage: string;
  benDraftPage: string;
  amaDraftHighlight: string;
  amaPublishedHighlight: string;
  coleDraftHighlight: string;
  benDraftHighlight: string;
  amaDraftStory: string;
  amaPublishedStory: string;
  paths: {
    amaDraftPhoto: string;
    amaPublishedPhoto: string;
    amaDraftPanel: string;
    amaPublishedPanel: string;
    benPhoto: string;
    amaAvatar: string;
    amaDraftAvatar: string;
    amaSelfie: string;
  };
  photoIds: { amaDraft: string; amaPublished: string; ben: string };
  inviteA: string;
  cleanup: () => Promise<void>;
}

const db = () => serviceClient();

export async function createPaper(owner: TestUser, name: string): Promise<string> {
  const paper = must(await db().from("papers").insert({ name, created_by: owner.id }).select("id").single());
  must(
    await db()
      .from("paper_members")
      .insert({ paper_id: paper.id, user_id: owner.id, role: "owner" })
      .select(),
  );
  return paper.id;
}

export async function addMember(paperId: string, user: TestUser): Promise<void> {
  must(
    await db().from("paper_members").insert({ paper_id: paperId, user_id: user.id, role: "member" }).select(),
  );
}

export async function createEdition(paperId: string, weekStart: string): Promise<string> {
  return must(
    await db().from("editions").insert({ paper_id: paperId, week_start: weekStart }).select("id").single(),
  ).id;
}

export async function publish(editionId: string): Promise<void> {
  must(
    await db()
      .from("editions")
      .update({ status: "published", published_at: new Date().toISOString(), expires_at: inDays(14) })
      .eq("id", editionId)
      .select(),
  );
}

export async function createPage(
  user: TestUser,
  weekStart: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  return must(
    await db()
      .from("pages")
      .insert({ user_id: user.id, week_start: weekStart, ...extra })
      .select("id")
      .single(),
  ).id;
}

export async function linkPage(
  pageId: string,
  user: TestUser,
  paperId: string,
  editionId: string,
): Promise<void> {
  must(
    await db()
      .from("page_papers")
      .insert({ page_id: pageId, user_id: user.id, paper_id: paperId, edition_id: editionId })
      .select(),
  );
}

export async function createHighlight(
  pageId: string,
  user: TestUser,
  position = 0,
  extra: Record<string, unknown> = {},
): Promise<string> {
  return must(
    await db()
      .from("highlights")
      .insert({
        page_id: pageId,
        user_id: user.id,
        text: "Ran my first 5K",
        position,
        ...extra,
      })
      .select("id")
      .single(),
  ).id;
}

export async function createStory(pageId: string, highlightId: string, user: TestUser): Promise<string> {
  return must(
    await db()
      .from("stories")
      .insert({
        page_id: pageId,
        highlight_id: highlightId,
        user_id: user.id,
        section: "news",
        headline: "Local runner finishes 5K",
        body: "It happened. It was great.",
      })
      .select("id")
      .single(),
  ).id;
}

export async function addPanel(
  pageId: string,
  highlightId: string,
  user: TestUser,
  idx = 0,
): Promise<string> {
  const path = `${user.id}/${randomUUID()}.png`;
  await upload("panels", path);
  must(
    await db()
      .from("panels")
      .insert({
        page_id: pageId,
        idx,
        user_id: user.id,
        highlight_id: highlightId,
        scene: "Ama crosses the finish line.",
        caption: "Done!",
        dialogue: [{ text: "What a week!", side: "left" }],
        storage_path: path,
        status: "ready",
      })
      .select(),
  );
  return path;
}

export async function addPhoto(
  highlightId: string,
  user: TestUser,
  position = 0,
): Promise<{ id: string; path: string }> {
  const path = `${user.id}/${randomUUID()}.png`;
  await upload("photos", path);
  const row = must(
    await db()
      .from("photos")
      .insert({
        highlight_id: highlightId,
        user_id: user.id,
        storage_path: path,
        width: 1,
        height: 1,
        byte_size: 68,
        position,
      })
      .select("id")
      .single(),
  );
  return { id: row.id, path };
}

/** Removes files this test uploaded, and the outbox rows the delete triggers queued. */
export async function removeObjects(byBucket: Record<string, string[]>): Promise<void> {
  for (const [bucket, paths] of Object.entries(byBucket)) {
    if (paths.length === 0) continue;
    await db().storage.from(bucket).remove(paths);
    await db().from("storage_deletions").delete().eq("bucket", bucket).in("path", paths);
  }
}

export async function buildWorld(): Promise<World> {
  const [ama, ben, cole] = await Promise.all([createUser("ama"), createUser("ben"), createUser("cole")]);

  const paperA = await createPaper(ama, "The Ama Times");
  const paperB = await createPaper(ben, "Ben's Bugle");
  await addMember(paperA, cole);

  const draftA = await createEdition(paperA, MONDAY);
  const publishedA = await createEdition(paperA, PREVIOUS_MONDAY);
  const draftB = await createEdition(paperB, MONDAY);

  const now = new Date().toISOString();
  const amaDraftPage = await createPage(ama, MONDAY);
  const amaPublishedPage = await createPage(ama, PREVIOUS_MONDAY, {
    status: "approved",
    generated_at: now,
    approved_at: now,
    comic_title: "Meanwhile, last week",
  });
  const coleDraftPage = await createPage(cole, MONDAY);
  const benDraftPage = await createPage(ben, MONDAY);

  await linkPage(amaDraftPage, ama, paperA, draftA);
  await linkPage(amaPublishedPage, ama, paperA, publishedA);
  await linkPage(coleDraftPage, cole, paperA, draftA);
  await linkPage(benDraftPage, ben, paperB, draftB);

  const amaDraftHighlight = await createHighlight(amaDraftPage, ama);
  const amaPublishedHighlight = await createHighlight(amaPublishedPage, ama);
  const coleDraftHighlight = await createHighlight(coleDraftPage, cole);
  const benDraftHighlight = await createHighlight(benDraftPage, ben);

  const amaDraftStory = await createStory(amaDraftPage, amaDraftHighlight, ama);
  const amaPublishedStory = await createStory(amaPublishedPage, amaPublishedHighlight, ama);

  const amaDraftPhoto = await addPhoto(amaDraftHighlight, ama);
  const amaPublishedPhoto = await addPhoto(amaPublishedHighlight, ama);
  const benPhoto = await addPhoto(benDraftHighlight, ben);
  const amaDraftPanel = await addPanel(amaDraftPage, amaDraftHighlight, ama);
  const amaPublishedPanel = await addPanel(amaPublishedPage, amaPublishedHighlight, ama);
  await publish(publishedA);

  const amaAvatar = `${ama.id}/${randomUUID()}.png`;
  const amaDraftAvatar = `${ama.id}/${randomUUID()}.png`;
  const amaSelfie = `${ama.id}/${randomUUID()}.png`;
  await Promise.all([
    upload("avatars", amaAvatar),
    upload("avatars", amaDraftAvatar),
    upload("selfies", amaSelfie),
  ]);
  must(await db().from("profiles").update({ name: "Ama", avatar_path: amaAvatar }).eq("id", ama.id).select());
  must(
    await db()
      .from("avatar_drafts")
      .insert({
        user_id: ama.id,
        selfie_path: amaSelfie,
        draft_path: amaDraftAvatar,
        status: "ready",
        selfie_expires_at: inDays(1 / 24),
      })
      .select(),
  );

  const inviteA = must(
    await db()
      .from("invites")
      .insert({ paper_id: paperA, code_hash: "a".repeat(64), created_by: ama.id, expires_at: inDays(7) })
      .select("id")
      .single(),
  ).id;

  return {
    ama,
    ben,
    cole,
    paperA,
    paperB,
    draftA,
    publishedA,
    draftB,
    amaDraftPage,
    amaPublishedPage,
    coleDraftPage,
    benDraftPage,
    amaDraftHighlight,
    amaPublishedHighlight,
    coleDraftHighlight,
    benDraftHighlight,
    amaDraftStory,
    amaPublishedStory,
    paths: {
      amaDraftPhoto: amaDraftPhoto.path,
      amaPublishedPhoto: amaPublishedPhoto.path,
      amaDraftPanel,
      amaPublishedPanel,
      benPhoto: benPhoto.path,
      amaAvatar,
      amaDraftAvatar,
      amaSelfie,
    },
    photoIds: { amaDraft: amaDraftPhoto.id, amaPublished: amaPublishedPhoto.id, ben: benPhoto.id },
    inviteA,
    cleanup: async () => {
      await db().from("papers").delete().in("id", [paperA, paperB]);
      await deleteUsers([ama, ben, cole]);
      await removeObjects({
        photos: [amaDraftPhoto.path, amaPublishedPhoto.path, benPhoto.path],
        panels: [amaDraftPanel, amaPublishedPanel],
        avatars: [amaAvatar, amaDraftAvatar],
        selfies: [amaSelfie],
      });
    },
  };
}
