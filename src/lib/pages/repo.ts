import type { z } from "zod";
import type { StyleKey } from "@/lib/contract/common";
import type {
  comicSchema,
  highlightSchema,
  pagePaperSchema,
  pageSchema,
  panelSchema,
  photoSchema,
  storySchema,
} from "@/lib/contract/pages";
import { PAGE_LIMITS } from "@/lib/contract/pages";
import { getAiService, toApiError } from "@/lib/ai";
import { AiError } from "@/lib/ai/errors";
import { serviceDb } from "@/lib/db/client";
import { unwrap, unwrapMaybe } from "@/lib/db/errors";
import type { Json } from "@/lib/db/types";
import { ApiError } from "@/lib/http/errors";
import { requireMember } from "@/lib/papers/repo";
import { signUrls, urlsExpireAt } from "@/lib/storage/signed";
import { deadlineOf, isAtOrAfter, mondayOf, sundayOf } from "@/lib/time/week";
import { getOrCreateCurrentEdition, ownerTimezone } from "@/lib/editions/current";

type Page = z.input<typeof pageSchema>;
type Highlight = z.input<typeof highlightSchema>;
type Photo = z.input<typeof photoSchema>;
type Story = z.input<typeof storySchema>;
type Panel = z.input<typeof panelSchema>;
type PagePaper = z.input<typeof pagePaperSchema>;
type PageNotice = Page["notices"][number];
type HighlightNotice = Highlight["notices"][number];

const PAGE_COLUMNS =
  "id, user_id, week_start, week_end, status, style, notices, regenerations_used, rewrites_used, redraws_used, generated_at, approved_at, comic_title";

export interface PageRow {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string | null;
  status: "writing" | "generated" | "approved";
  style: string;
  notices: string[];
  regenerations_used: number;
  rewrites_used: number;
  redraws_used: number;
  generated_at: string | null;
  approved_at: string | null;
  comic_title: string | null;
}

export interface HighlightRow {
  id: string;
  page_id: string;
  user_id: string;
  text: string;
  serious: boolean;
  in_comic: boolean;
  position: number;
  notices: string[];
  created_at: string;
  updated_at: string;
}

export async function userTimezone(userId: string): Promise<string> {
  const row = unwrapMaybe(
    await serviceDb().from("profiles").select("timezone").eq("id", userId).maybeSingle(),
  );
  return row?.timezone ?? "UTC";
}

export async function requireAuthor(pageId: string, userId: string): Promise<PageRow> {
  const row = unwrapMaybe(
    await serviceDb().from("pages").select(PAGE_COLUMNS).eq("id", pageId).maybeSingle(),
  );
  if (!row || row.user_id !== userId) throw new ApiError("not_found");
  return row;
}

export async function pageLock(pageId: string): Promise<{
  papers: PagePaper[];
  deadline: string | null;
  locked: boolean;
}> {
  const links = unwrap(
    await serviceDb().from("page_papers").select("paper_id, edition_id").eq("page_id", pageId),
  );
  if (links.length === 0) return { papers: [], deadline: null, locked: false };
  const editions = unwrap(
    await serviceDb()
      .from("editions")
      .select("id, week_start, status")
      .in(
        "id",
        links.map((l) => l.edition_id),
      ),
  );
  const paperRows = unwrap(
    await serviceDb()
      .from("papers")
      .select("id, name")
      .in(
        "id",
        links.map((l) => l.paper_id),
      ),
  );
  const editionById = new Map(editions.map((e) => [e.id, e]));
  const nameById = new Map(paperRows.map((p) => [p.id, p.name]));
  const papers: PagePaper[] = [];
  let earliest: Date | undefined;
  let published = false;
  for (const link of links) {
    const edition = editionById.get(link.edition_id);
    if (!edition) continue;
    const tz = await ownerTimezone(link.paper_id);
    const deadline = deadlineOf(edition.week_start, tz);
    if (!earliest || deadline < earliest) earliest = deadline;
    if (edition.status === "published") published = true;
    papers.push({
      paperId: link.paper_id,
      paperName: nameById.get(link.paper_id) ?? "Paper",
      editionId: link.edition_id,
      deadline: deadline.toISOString(),
    });
  }
  papers.sort((a, b) => a.paperName.localeCompare(b.paperName));
  return {
    papers,
    deadline: earliest?.toISOString() ?? null,
    locked: published || (earliest ? isAtOrAfter(earliest) : false),
  };
}

export function assertWritable(locked: boolean): void {
  if (locked) throw new ApiError("edition_locked");
}

export async function findCurrentPage(userId: string): Promise<PageRow | null> {
  const weekStart = mondayOf(new Date(), await userTimezone(userId));
  return unwrapMaybe(
    await serviceDb()
      .from("pages")
      .select(PAGE_COLUMNS)
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle(),
  );
}

export async function getOrCreateCurrentPage(userId: string): Promise<PageRow> {
  const existing = await findCurrentPage(userId);
  if (existing) return existing;
  const weekStart = mondayOf(new Date(), await userTimezone(userId));
  const profile = unwrap(await serviceDb().from("profiles").select("style").eq("id", userId).single());
  try {
    return unwrap(
      await serviceDb()
        .from("pages")
        .insert({ user_id: userId, week_start: weekStart, style: profile.style })
        .select(PAGE_COLUMNS)
        .single(),
    );
  } catch (err) {
    if (err instanceof ApiError && err.code === "conflict") {
      const again = await findCurrentPage(userId);
      if (again) return again;
    }
    throw err;
  }
}

export async function setCurrentPapers(userId: string, paperIds: string[]): Promise<Page> {
  const page = await getOrCreateCurrentPage(userId);
  const lock = await pageLock(page.id);
  const same =
    lock.papers.length === paperIds.length &&
    new Set(lock.papers.map((p) => p.paperId)).size === paperIds.length &&
    paperIds.every((id) => lock.papers.some((p) => p.paperId === id));
  if (lock.locked && !same) assertWritable(true);
  if (same) return assemblePage(page);

  const links: { paper_id: string; edition_id: string }[] = [];
  for (const paperId of paperIds) {
    await requireMember(paperId, userId);
    const edition = await getOrCreateCurrentEdition(paperId);
    const tz = await ownerTimezone(paperId);
    if (edition.status === "published" || isAtOrAfter(deadlineOf(edition.week_start, tz))) {
      throw new ApiError("edition_locked");
    }
    links.push({ paper_id: paperId, edition_id: edition.id });
  }

  unwrap(await serviceDb().from("page_papers").delete().eq("page_id", page.id).select("page_id"));
  unwrap(
    await serviceDb()
      .from("page_papers")
      .insert(links.map((l) => ({ page_id: page.id, user_id: userId, ...l })))
      .select("page_id"),
  );
  return assemblePage(await requireAuthor(page.id, userId));
}

export async function listHighlights(pageId: string): Promise<HighlightRow[]> {
  return unwrap(await serviceDb().from("highlights").select("*").eq("page_id", pageId).order("position"));
}

function asNotices(raw: string[]): PageNotice[] {
  return raw.filter((n): n is PageNotice => n === "fallback_used" || n === "stale");
}

function asHighlightNotices(raw: string[]): HighlightNotice[] {
  return raw.filter((n): n is HighlightNotice => n === "marked_serious");
}

function asDialogue(raw: Json): Panel["dialogue"] {
  if (!Array.isArray(raw)) return [];
  const out: Panel["dialogue"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const text = item.text;
    const side = item.side;
    if (typeof text === "string" && (side === "left" || side === "right")) out.push({ text, side });
  }
  return out;
}

async function signedPhotoMap(photos: { storage_path: string }[]): Promise<Map<string, string>> {
  return signUrls(
    "photos",
    photos.map((p) => p.storage_path),
  );
}

export async function assemblePage(page: PageRow): Promise<Page> {
  const [lock, highlights, stories, panels, photos] = await Promise.all([
    pageLock(page.id),
    listHighlights(page.id),
    unwrap(await serviceDb().from("stories").select("*").eq("page_id", page.id)),
    unwrap(await serviceDb().from("panels").select("*").eq("page_id", page.id).order("idx")),
    unwrap(
      await serviceDb()
        .from("photos")
        .select("id, highlight_id, storage_path, width, height, created_at, position")
        .eq("user_id", page.user_id),
    ),
  ]);
  const highlightIds = new Set(highlights.map((h) => h.id));
  const pagePhotos = photos.filter((p) => highlightIds.has(p.highlight_id));
  const photoUrls = await signedPhotoMap(pagePhotos);
  const panelUrls = await signUrls(
    "panels",
    panels.map((p) => p.storage_path),
  );

  const photosByHighlight = new Map<string, Photo[]>();
  for (const p of pagePhotos.sort((a, b) => a.position - b.position)) {
    const url = photoUrls.get(p.storage_path);
    if (!url) continue;
    const list = photosByHighlight.get(p.highlight_id) ?? [];
    list.push({
      id: p.id,
      highlightId: p.highlight_id,
      url,
      width: p.width,
      height: p.height,
      createdAt: p.created_at,
    });
    photosByHighlight.set(p.highlight_id, list);
  }

  const highlightViews: Highlight[] = highlights.map((h) => ({
    id: h.id,
    pageId: h.page_id,
    text: h.text,
    serious: h.serious,
    inComic: h.in_comic,
    position: h.position,
    photos: photosByHighlight.get(h.id) ?? [],
    notices: asHighlightNotices(h.notices),
    createdAt: h.created_at,
    updatedAt: h.updated_at,
  }));

  const storyByHighlight = new Map(stories.map((s) => [s.highlight_id, s]));
  const storyViews: Story[] = highlights.flatMap((h) => {
    const s = storyByHighlight.get(h.id);
    if (!s) return [];
    return [
      {
        id: s.id,
        highlightId: s.highlight_id,
        section: s.section as Story["section"],
        headline: s.headline,
        body: s.body,
        photos: (photosByHighlight.get(h.id) ?? []).map((p) => p.url),
      },
    ];
  });

  let comic: z.input<typeof comicSchema> | null = null;
  if (page.status !== "writing" && panels.length === 4) {
    comic = {
      title: page.comic_title ?? "Meanwhile, this week",
      panels: panels.map((p) => ({
        index: p.idx,
        caption: p.caption,
        dialogue: asDialogue(p.dialogue),
        highlightId: p.highlight_id,
        image: {
          status: p.status,
          url: p.storage_path ? (panelUrls.get(p.storage_path) ?? null) : null,
          error: (p.error as Panel["image"]["error"]) ?? null,
        },
        photos: (photosByHighlight.get(p.highlight_id) ?? []).map((ph) => ph.url),
      })),
    };
  }

  const deadline = lock.deadline ?? deadlineOf(page.week_start, "UTC").toISOString();
  return {
    id: page.id,
    weekStart: page.week_start,
    weekEnd: page.week_end ?? sundayOf(page.week_start),
    deadline,
    locked: lock.locked,
    style: page.style as StyleKey,
    papers: lock.papers,
    status: page.status,
    highlights: highlightViews,
    stories: storyViews,
    comic,
    notices: asNotices(page.notices),
    limits: {
      regenerationsLeft: PAGE_LIMITS.regenerations - page.regenerations_used,
      rewritesLeft: PAGE_LIMITS.rewrites - page.rewrites_used,
      redrawsLeft: PAGE_LIMITS.redraws - page.redraws_used,
    },
    generatedAt: page.generated_at,
    approvedAt: page.approved_at,
    urlsExpireAt: urlsExpireAt(),
  };
}

export async function getAuthorPage(pageId: string, userId: string): Promise<Page> {
  return assemblePage(await requireAuthor(pageId, userId));
}

export async function getCurrentAuthorPage(userId: string): Promise<Page | null> {
  const page = await findCurrentPage(userId);
  return page ? assemblePage(page) : null;
}

export async function markStale(page: PageRow): Promise<void> {
  if (page.status === "writing") return;
  const notices = [...new Set([...page.notices.filter((n) => n !== "stale"), "stale"])];
  unwrap(
    await serviceDb()
      .from("pages")
      .update({ status: "generated", approved_at: null, notices })
      .eq("id", page.id)
      .select("id")
      .single(),
  );
}

function forceComicFlag(serious: boolean, inComic: boolean | undefined): boolean {
  return serious ? false : (inComic ?? true);
}

export async function addHighlight(
  pageId: string,
  userId: string,
  input: { text: string; serious: boolean; inComic: boolean },
  requestId: string,
): Promise<Highlight> {
  const page = await requireAuthor(pageId, userId);
  assertWritable((await pageLock(page.id)).locked);
  const existing = await listHighlights(pageId);
  if (existing.length >= PAGE_LIMITS.highlights) throw new ApiError("conflict");

  let serious = input.serious;
  let notices: string[] = [];
  try {
    const checked = await getAiService().checkHighlight({ text: input.text }, { requestId, userId });
    if (checked.serious && !serious) {
      serious = true;
      notices = ["marked_serious"];
    }
  } catch (err) {
    if (err instanceof AiError) throw toApiError(err);
    throw err;
  }

  const row = unwrap(
    await serviceDb()
      .from("highlights")
      .insert({
        page_id: pageId,
        user_id: userId,
        text: input.text,
        serious,
        in_comic: forceComicFlag(serious, input.inComic),
        position: existing.length,
        notices,
      })
      .select("*")
      .single(),
  );
  await markStale(page);
  const assembled = await assemblePage(await requireAuthor(pageId, userId));
  return assembled.highlights.find((h) => h.id === row.id)!;
}

export async function updateHighlight(
  highlightId: string,
  userId: string,
  input: { text?: string; serious?: boolean; inComic?: boolean },
  requestId: string,
): Promise<Highlight> {
  const row = unwrapMaybe(
    await serviceDb().from("highlights").select("*").eq("id", highlightId).maybeSingle(),
  );
  if (!row || row.user_id !== userId) throw new ApiError("not_found");
  const page = await requireAuthor(row.page_id, userId);
  assertWritable((await pageLock(page.id)).locked);

  const text = input.text ?? row.text;
  let serious = input.serious ?? row.serious;
  let notices = row.notices;
  if (input.text !== undefined) {
    try {
      const checked = await getAiService().checkHighlight({ text }, { requestId, userId });
      if (checked.serious && !serious) {
        serious = true;
        notices = [...new Set([...notices, "marked_serious"])];
      }
    } catch (err) {
      if (err instanceof AiError) throw toApiError(err);
      throw err;
    }
  }
  const inComic = forceComicFlag(serious, input.inComic ?? row.in_comic);
  unwrap(
    await serviceDb()
      .from("highlights")
      .update({ text, serious, in_comic: inComic, notices })
      .eq("id", highlightId)
      .select("id")
      .single(),
  );
  await markStale(page);
  const assembled = await assemblePage(await requireAuthor(page.id, userId));
  return assembled.highlights.find((h) => h.id === highlightId)!;
}

export async function deleteHighlight(highlightId: string, userId: string): Promise<void> {
  const row = unwrapMaybe(
    await serviceDb().from("highlights").select("*").eq("id", highlightId).maybeSingle(),
  );
  if (!row || row.user_id !== userId) throw new ApiError("not_found");
  const page = await requireAuthor(row.page_id, userId);
  assertWritable((await pageLock(page.id)).locked);
  unwrap(await serviceDb().from("highlights").delete().eq("id", highlightId).select("id"));
  const left = await listHighlights(page.id);
  for (const [i, h] of left.entries()) {
    unwrap(
      await serviceDb()
        .from("highlights")
        .update({ position: i + 10 })
        .eq("id", h.id)
        .select("id"),
    );
  }
  for (const [i, h] of left.entries()) {
    unwrap(await serviceDb().from("highlights").update({ position: i }).eq("id", h.id).select("id"));
  }
  await markStale(page);
}

export async function reorderHighlights(
  pageId: string,
  userId: string,
  highlightIds: string[],
): Promise<Page> {
  const page = await requireAuthor(pageId, userId);
  assertWritable((await pageLock(page.id)).locked);
  const existing = await listHighlights(pageId);
  if (
    existing.length !== highlightIds.length ||
    new Set(highlightIds).size !== highlightIds.length ||
    !existing.every((h) => highlightIds.includes(h.id))
  ) {
    throw new ApiError("bad_request", { details: [{ path: "body.highlightIds", issue: "invalid_order" }] });
  }
  for (const [i, id] of highlightIds.entries()) {
    unwrap(
      await serviceDb()
        .from("highlights")
        .update({ position: i + 10 })
        .eq("id", id)
        .select("id"),
    );
  }
  for (const [i, id] of highlightIds.entries()) {
    unwrap(await serviceDb().from("highlights").update({ position: i }).eq("id", id).select("id"));
  }
  return assemblePage(await requireAuthor(pageId, userId));
}

export async function getAuthorHighlight(highlightId: string, userId: string): Promise<Highlight> {
  const row = unwrapMaybe(
    await serviceDb().from("highlights").select("*").eq("id", highlightId).maybeSingle(),
  );
  if (!row || row.user_id !== userId) throw new ApiError("not_found");
  const page = await assemblePage(await requireAuthor(row.page_id, userId));
  return page.highlights.find((h) => h.id === highlightId)!;
}

export async function requireAuthorHighlight(highlightId: string, userId: string): Promise<HighlightRow> {
  const row = unwrapMaybe(
    await serviceDb().from("highlights").select("*").eq("id", highlightId).maybeSingle(),
  );
  if (!row || row.user_id !== userId) throw new ApiError("not_found");
  return row;
}
