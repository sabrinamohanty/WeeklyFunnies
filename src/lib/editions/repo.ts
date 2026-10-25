import { createHash } from "node:crypto";
import type { z } from "zod";
import type { StyleKey } from "@/lib/contract/common";
import type {
  editionBundleSchema,
  editionSummarySchema,
  reactionCountsSchema,
  reactionSchema,
} from "@/lib/contract/editions";
import { getConfig } from "@/lib/config/env";
import { horoscopesFor } from "@/lib/editions/horoscopes";
import { serviceDb } from "@/lib/db/client";
import { unwrap, unwrapMaybe } from "@/lib/db/errors";
import type { Json } from "@/lib/db/types";
import { ApiError } from "@/lib/http/errors";
import { listMembers, requireMember, requireOwner, type Role } from "@/lib/papers/repo";
import { signUrls, urlsExpireAt } from "@/lib/storage/signed";
import { deadlineOf, isAtOrAfter, sundayOf } from "@/lib/time/week";
import {
  type EditionRow,
  getEdition,
  getOrCreateCurrentEdition,
  listEditions,
  ownerTimezone,
} from "./current";

type EditionSummary = z.input<typeof editionSummarySchema>;
type Bundle = z.input<typeof editionBundleSchema>;
type Reaction = z.infer<typeof reactionSchema>;
type Counts = z.infer<typeof reactionCountsSchema>;

export function toSummary(row: EditionRow, timeZone: string): EditionSummary {
  return {
    id: row.id,
    paperId: row.paper_id,
    issueNumber: row.issue_number,
    weekStart: row.week_start,
    weekEnd: row.week_end ?? sundayOf(row.week_start),
    deadline: deadlineOf(row.week_start, timeZone).toISOString(),
    status: row.status,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    savedAt: row.saved_at,
  };
}

export async function listPaperEditions(paperId: string, userId: string): Promise<EditionSummary[]> {
  await requireMember(paperId, userId);
  const tz = await ownerTimezone(paperId);
  return (await listEditions(paperId)).map((row) => toSummary(row, tz));
}

export async function currentPaperEdition(paperId: string, userId: string): Promise<EditionSummary> {
  await requireMember(paperId, userId);
  const row = await getOrCreateCurrentEdition(paperId);
  return toSummary(row, await ownerTimezone(paperId));
}

async function requireEditionMember(
  editionId: string,
  userId: string,
): Promise<{ edition: EditionRow; role: Role }> {
  const edition = await getEdition(editionId);
  if (!edition) throw new ApiError("not_found");
  const role = await requireMember(edition.paper_id, userId);
  return { edition, role };
}

function emptyCounts(): Counts {
  return { ha: 0, aww: 0, hooray: 0 };
}

function tally(
  rows: { reaction: Reaction; user_id: string }[],
  userId: string,
): {
  reactions: Counts;
  myReaction: Reaction | null;
} {
  const reactions = emptyCounts();
  let myReaction: Reaction | null = null;
  for (const r of rows) {
    reactions[r.reaction] += 1;
    if (r.user_id === userId) myReaction = r.reaction;
  }
  return { reactions, myReaction };
}

function monthDayInWeek(birthday: string, weekStart: string, weekEnd: string): boolean {
  const md = birthday.slice(5);
  const start = weekStart.slice(5);
  const end = weekEnd.slice(5);
  if (start <= end) return md >= start && md <= end;
  return md >= start || md <= end;
}

function dialogueOf(raw: Json): Array<{ text: string; side: "left" | "right" }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ text: string; side: "left" | "right" }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (typeof item.text === "string" && (item.side === "left" || item.side === "right")) {
      out.push({ text: item.text, side: item.side });
    }
  }
  return out;
}

function shuffleStable<T>(items: T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ha = createHash("sha256")
      .update(`${seed}:${key(a)}`)
      .digest("hex");
    const hb = createHash("sha256")
      .update(`${seed}:${key(b)}`)
      .digest("hex");
    return ha.localeCompare(hb);
  });
}

export async function getBundle(editionId: string, userId: string): Promise<Bundle> {
  const { edition, role } = await requireEditionMember(editionId, userId);
  const tz = await ownerTimezone(edition.paper_id);
  const paper = unwrap(await serviceDb().from("papers").select("name").eq("id", edition.paper_id).single());
  const members = await listMembers(edition.paper_id);
  const weekEnd = edition.week_end ?? sundayOf(edition.week_start);

  const links = unwrap(
    await serviceDb()
      .from("page_papers")
      .select("page_id, user_id, pages!inner(id, user_id, status, style, comic_title)")
      .eq("edition_id", editionId),
  );
  const pageByUser = new Map(links.map((l) => [l.user_id, l]));
  const progress = members.map((m) => {
    const link = pageByUser.get(m.userId);
    const status = !link ? "not_started" : link.pages.status === "approved" ? "approved" : "in_progress";
    return { userId: m.userId, status: status as "not_started" | "in_progress" | "approved" };
  });

  const birthdays = unwrap(
    await serviceDb()
      .from("paper_members")
      .select("user_id, profiles!inner(name, birthday)")
      .eq("paper_id", edition.paper_id),
  )
    .flatMap((m) => {
      const birthday = m.profiles.birthday;
      if (!birthday || !monthDayInWeek(birthday, edition.week_start, weekEnd)) return [];
      return [{ userId: m.user_id, name: m.profiles.name ?? "Friend", monthDay: birthday.slice(5) }];
    })
    .sort((a, b) => a.monthDay.localeCompare(b.monthDay) || a.name.localeCompare(b.name));

  const horoscopes = await horoscopesFor(edition.week_start, members);

  let pages: Bundle["pages"] = [];
  if (edition.status === "published") {
    const approved = links.filter((l) => l.pages.status === "approved");
    const pageIds = approved.map((l) => l.page_id);
    const highlightRows = pageIds.length
      ? unwrap(await serviceDb().from("highlights").select("id").in("page_id", pageIds))
      : [];
    const highlightIds = highlightRows.map((h) => h.id);
    const [stories, panels, photos, reactions] = pageIds.length
      ? await Promise.all([
          unwrap(await serviceDb().from("stories").select("*").in("page_id", pageIds)),
          unwrap(await serviceDb().from("panels").select("*").in("page_id", pageIds).order("idx")),
          highlightIds.length
            ? unwrap(
                await serviceDb()
                  .from("photos")
                  .select("highlight_id, storage_path, position")
                  .in("highlight_id", highlightIds),
              )
            : [],
          unwrap(
            await serviceDb()
              .from("reactions")
              .select("story_id, user_id, reaction")
              .eq("edition_id", editionId),
          ),
        ])
      : [[], [], [], []];

    const photoUrls = await signUrls(
      "photos",
      photos.map((p) => p.storage_path),
    );
    const panelUrls = await signUrls(
      "panels",
      panels.map((p) => p.storage_path),
    );
    const photosByHighlight = new Map<string, string[]>();
    for (const p of photos.sort((a, b) => a.position - b.position)) {
      const url = photoUrls.get(p.storage_path);
      if (!url) continue;
      const list = photosByHighlight.get(p.highlight_id) ?? [];
      list.push(url);
      photosByHighlight.set(p.highlight_id, list);
    }
    const reactionsByStory = new Map<string, { reaction: Reaction; user_id: string }[]>();
    for (const r of reactions) {
      const list = reactionsByStory.get(r.story_id) ?? [];
      list.push({ reaction: r.reaction, user_id: r.user_id });
      reactionsByStory.set(r.story_id, list);
    }

    pages = shuffleStable(
      approved.map((link) => {
        const pageStories = stories
          .filter((s) => s.page_id === link.page_id)
          .map((s) => {
            const tallied = tally(reactionsByStory.get(s.id) ?? [], userId);
            return {
              id: s.id,
              highlightId: s.highlight_id,
              section: s.section as Bundle["pages"][number]["stories"][number]["section"],
              headline: s.headline,
              body: s.body,
              photos: photosByHighlight.get(s.highlight_id) ?? [],
              reactions: tallied.reactions,
              myReaction: tallied.myReaction,
            };
          });
        const pagePanels = panels.filter((p) => p.page_id === link.page_id);
        return {
          pageId: link.page_id,
          authorId: link.user_id,
          style: link.pages.style as StyleKey,
          stories: pageStories,
          comic:
            pagePanels.length === 4
              ? {
                  title: link.pages.comic_title ?? "Meanwhile, this week",
                  panels: pagePanels.map((p) => ({
                    index: p.idx,
                    caption: p.caption,
                    dialogue: dialogueOf(p.dialogue),
                    highlightId: p.highlight_id,
                    image: {
                      status: p.status,
                      url: p.storage_path ? (panelUrls.get(p.storage_path) ?? null) : null,
                      error:
                        (p.error as
                          "generation_failed" | "content_blocked" | "provider_unavailable" | null) ?? null,
                    },
                    photos: photosByHighlight.get(p.highlight_id) ?? [],
                  })),
                }
              : null,
        };
      }),
      editionId,
      (p) => p.pageId,
    );
  }

  return {
    edition: { ...toSummary(edition, tz), paperName: paper.name },
    viewer: { userId, role },
    members: members.map((m) => ({
      userId: m.userId,
      name: m.name ?? "Friend",
      city: m.city,
      zodiacSign: m.zodiacSign,
      style: "classic" as StyleKey,
      avatarUrl: m.avatarUrl,
      role: m.role,
    })),
    progress,
    pages,
    horoscopes,
    birthdays,
    urlsExpireAt: urlsExpireAt(),
  };
}

async function memberStyles(paperId: string): Promise<Map<string, StyleKey>> {
  const rows = unwrap(
    await serviceDb().from("paper_members").select("user_id, profiles!inner(style)").eq("paper_id", paperId),
  );
  return new Map(rows.map((r) => [r.user_id, r.profiles.style as StyleKey]));
}

export async function getEditionBundle(editionId: string, userId: string): Promise<Bundle> {
  const bundle = await getBundle(editionId, userId);
  const styles = await memberStyles(bundle.edition.paperId);
  return {
    ...bundle,
    members: bundle.members.map((m) => ({ ...m, style: styles.get(m.userId) ?? m.style })),
  };
}

export async function publishEdition(editionId: string, userId: string): Promise<EditionSummary> {
  const edition = await getEdition(editionId);
  if (!edition) throw new ApiError("not_found");
  await requireOwner(edition.paper_id, userId);
  const tz = await ownerTimezone(edition.paper_id);
  if (edition.status === "published") return toSummary(edition, tz);
  if (!isAtOrAfter(deadlineOf(edition.week_start, tz))) throw new ApiError("conflict");

  const approved = unwrap(
    await serviceDb()
      .from("page_papers")
      .select("page_id, pages!inner(status)")
      .eq("edition_id", editionId)
      .eq("pages.status", "approved"),
  );
  if (approved.length) {
    const generating = unwrap(
      await serviceDb()
        .from("panels")
        .select("page_id")
        .in(
          "page_id",
          approved.map((p) => p.page_id),
        )
        .eq("status", "generating"),
    );
    if (generating.length) throw new ApiError("conflict");
  }

  const publishedAt = new Date();
  const expiresAt = new Date(
    publishedAt.getTime() + getConfig().RETENTION_PUBLISHED_DAYS * 86_400_000,
  ).toISOString();
  const updated = unwrap(
    await serviceDb()
      .from("editions")
      .update({
        status: "published",
        published_at: publishedAt.toISOString(),
        expires_at: expiresAt,
        saved_at: null,
      })
      .eq("id", editionId)
      .select("id, paper_id, week_start, week_end, status, published_at, expires_at, saved_at, issue_number")
      .single(),
  );
  return toSummary(updated, tz);
}

export async function saveEdition(
  editionId: string,
  userId: string,
  saved: boolean,
): Promise<EditionSummary> {
  const edition = await getEdition(editionId);
  if (!edition) throw new ApiError("not_found");
  await requireOwner(edition.paper_id, userId);
  if (edition.status !== "published" || !edition.published_at) throw new ApiError("conflict");
  const tz = await ownerTimezone(edition.paper_id);
  const updated = unwrap(
    await serviceDb().rpc("save_edition", {
      p_edition: editionId,
      p_saved: saved,
      p_days: getConfig().RETENTION_PUBLISHED_DAYS,
    }),
  );
  return toSummary(updated, tz);
}

export async function setReaction(
  editionId: string,
  storyId: string,
  userId: string,
  reaction: Reaction | null,
): Promise<{ reactions: Counts; myReaction: Reaction | null }> {
  const { edition } = await requireEditionMember(editionId, userId);
  if (edition.status !== "published") throw new ApiError("conflict");

  const story = unwrapMaybe(
    await serviceDb().from("stories").select("id, page_id").eq("id", storyId).maybeSingle(),
  );
  if (!story) throw new ApiError("not_found");
  const linked = unwrapMaybe(
    await serviceDb()
      .from("page_papers")
      .select("page_id, pages!inner(status)")
      .eq("edition_id", editionId)
      .eq("page_id", story.page_id)
      .maybeSingle(),
  );
  if (!linked || linked.pages.status !== "approved") throw new ApiError("not_found");

  if (reaction === null) {
    await serviceDb()
      .from("reactions")
      .delete()
      .eq("edition_id", editionId)
      .eq("story_id", storyId)
      .eq("user_id", userId);
  } else {
    unwrap(
      await serviceDb()
        .from("reactions")
        .upsert(
          { edition_id: editionId, story_id: storyId, user_id: userId, reaction },
          { onConflict: "edition_id,story_id,user_id" },
        )
        .select("story_id")
        .single(),
    );
  }

  const rows = unwrap(
    await serviceDb()
      .from("reactions")
      .select("user_id, reaction")
      .eq("edition_id", editionId)
      .eq("story_id", storyId),
  );
  return tally(rows, userId);
}

export async function failStuckPanels(olderThanMs = 120_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const stuck = unwrap(
    await serviceDb()
      .from("panels")
      .select("page_id, idx")
      .eq("status", "generating")
      .lt("updated_at", cutoff),
  );
  if (stuck.length === 0) return 0;
  for (const p of stuck) {
    await serviceDb()
      .from("panels")
      .update({ status: "failed", error: "generation_failed" })
      .eq("page_id", p.page_id)
      .eq("idx", p.idx);
  }
  return stuck.length;
}
