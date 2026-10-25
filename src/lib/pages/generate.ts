import type { z } from "zod";
import type { StyleKey } from "@/lib/contract/common";
import { PAGE_LIMITS, type pageSchema, type panelSchema, type storySchema } from "@/lib/contract/pages";
import { getAiService, styleConfig, toApiError } from "@/lib/ai";
import { AiError } from "@/lib/ai/errors";
import type { PagePanel, PageStory } from "@/lib/ai/types";
import { serviceDb } from "@/lib/db/client";
import { unwrap, unwrapMaybe } from "@/lib/db/errors";
import type { Json } from "@/lib/db/types";
import { ApiError } from "@/lib/http/errors";
import { objectPath, uploadObject, downloadObject } from "@/lib/storage/objects";
import { assemblePage, assertWritable, listHighlights, pageLock, requireAuthor, type PageRow } from "./repo";

type Page = z.input<typeof pageSchema>;
type Story = z.input<typeof storySchema>;
type Panel = z.input<typeof panelSchema>;

async function ai<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AiError) throw toApiError(err);
    throw err;
  }
}

async function authorForAi(userId: string): Promise<{ userId: string; name: string; city?: string | null }> {
  const row = unwrap(
    await serviceDb()
      .from("profiles")
      .select("name, city_name, look, style, avatar_path")
      .eq("id", userId)
      .single(),
  );
  return { userId, name: row.name ?? "Friend", city: row.city_name };
}

async function profileStyle(userId: string): Promise<StyleKey> {
  const row = unwrap(await serviceDb().from("profiles").select("style").eq("id", userId).single());
  return row.style as StyleKey;
}

function noticeList(current: string[], fallback: boolean, clearStale: boolean): string[] {
  const next = new Set(current);
  if (clearStale) next.delete("stale");
  if (fallback) next.add("fallback_used");
  return [...next];
}

async function replaceStories(page: PageRow, stories: PageStory[]): Promise<void> {
  unwrap(await serviceDb().from("stories").delete().eq("page_id", page.id).select("id"));
  if (stories.length === 0) return;
  unwrap(
    await serviceDb()
      .from("stories")
      .insert(
        stories.map((s) => ({
          page_id: page.id,
          highlight_id: s.highlightId,
          user_id: page.user_id,
          section: s.section,
          headline: s.headline,
          body: s.body,
        })),
      )
      .select("id"),
  );
}

async function replacePanels(page: PageRow, panels: PagePanel[] | null): Promise<void> {
  unwrap(await serviceDb().from("panels").delete().eq("page_id", page.id).select("page_id"));
  if (!panels?.length) {
    unwrap(
      await serviceDb().from("pages").update({ comic_title: null }).eq("id", page.id).select("id").single(),
    );
    return;
  }
  unwrap(
    await serviceDb()
      .from("panels")
      .insert(
        panels.map((p, idx) => ({
          page_id: page.id,
          idx,
          user_id: page.user_id,
          highlight_id: p.highlightId,
          caption: p.caption,
          dialogue: (p.dialogue ?? []) as NonNullable<Json>,
          scene: p.scene,
          status: "pending" as const,
        })),
      )
      .select("page_id"),
  );
}

export async function generatePage(
  pageId: string,
  userId: string,
  regenerate: boolean,
  requestId: string,
): Promise<Page> {
  const page = await requireAuthor(pageId, userId);
  assertWritable((await pageLock(page.id)).locked);
  const highlights = await listHighlights(pageId);
  if (highlights.length === 0) {
    throw new ApiError("bad_request", { details: [{ path: "body", issue: "highlights_required" }] });
  }

  const stale = page.notices.includes("stale");
  if (page.status !== "writing" && !regenerate && !stale) {
    return assemblePage(page);
  }
  if (regenerate) {
    if (page.regenerations_used >= PAGE_LIMITS.regenerations) throw new ApiError("quota_exceeded");
  }

  const author = await authorForAi(userId);
  const style = await profileStyle(userId);
  const result = await ai(() =>
    getAiService().writePage(
      {
        weekLabel: `the week of ${page.week_start}`,
        author,
        highlights: highlights.map((h) => ({
          id: h.id,
          text: h.text,
          serious: h.serious,
          inComic: h.in_comic,
        })),
      },
      { requestId, userId },
    ),
  );

  await replaceStories(page, result.stories);
  await replacePanels(page, result.comic?.panels ?? null);
  unwrap(
    await serviceDb()
      .from("pages")
      .update({
        status: "generated",
        style,
        comic_title: result.comic?.title ?? null,
        generated_at: page.generated_at ?? new Date().toISOString(),
        approved_at: null,
        regenerations_used: regenerate ? page.regenerations_used + 1 : page.regenerations_used,
        notices: noticeList(page.notices, result.usedFallback, true),
      })
      .eq("id", pageId)
      .select("id")
      .single(),
  );
  return assemblePage(await requireAuthor(pageId, userId));
}

export async function rewriteStory(
  pageId: string,
  storyId: string,
  userId: string,
  requestId: string,
): Promise<Story> {
  const page = await requireAuthor(pageId, userId);
  assertWritable((await pageLock(page.id)).locked);
  if (page.status === "writing") throw new ApiError("conflict");
  if (page.rewrites_used >= PAGE_LIMITS.rewrites) throw new ApiError("quota_exceeded");

  const story = unwrapMaybe(
    await serviceDb().from("stories").select("*").eq("id", storyId).eq("page_id", pageId).maybeSingle(),
  );
  if (!story) throw new ApiError("not_found");
  const highlight = unwrap(
    await serviceDb().from("highlights").select("*").eq("id", story.highlight_id).single(),
  );
  const author = await authorForAi(userId);
  const result = await ai(() =>
    getAiService().rewriteStory(
      {
        weekLabel: `the week of ${page.week_start}`,
        author,
        highlight: {
          id: highlight.id,
          text: highlight.text,
          serious: highlight.serious,
          inComic: highlight.in_comic,
        },
        previousHeadline: story.headline,
      },
      { requestId, userId },
    ),
  );
  unwrap(
    await serviceDb()
      .from("stories")
      .update({
        section: result.story.section,
        headline: result.story.headline,
        body: result.story.body,
      })
      .eq("id", storyId)
      .select("id")
      .single(),
  );
  unwrap(
    await serviceDb()
      .from("pages")
      .update({
        rewrites_used: page.rewrites_used + 1,
        status: "generated",
        approved_at: null,
        notices: noticeList(page.notices, result.usedFallback, false),
      })
      .eq("id", pageId)
      .select("id")
      .single(),
  );
  const assembled = await assemblePage(await requireAuthor(pageId, userId));
  return assembled.stories.find((s) => s.id === storyId)!;
}

export async function updatePageText(
  pageId: string,
  userId: string,
  body: {
    stories?: Array<{ id: string; headline?: string; body?: string }>;
    comic?: {
      title?: string;
      panels?: Array<{ index: number; caption?: string | null; dialogue?: Array<{ text: string }> }>;
    };
  },
  requestId: string,
): Promise<Page> {
  const page = await requireAuthor(pageId, userId);
  assertWritable((await pageLock(page.id)).locked);
  if (page.status === "writing") throw new ApiError("conflict");
  const svc = getAiService();

  if (body.stories) {
    for (const [i, edit] of body.stories.entries()) {
      const row = unwrapMaybe(
        await serviceDb().from("stories").select("id").eq("id", edit.id).eq("page_id", pageId).maybeSingle(),
      );
      if (!row) throw new ApiError("not_found");
      const patch: { headline?: string; body?: string } = {};
      if (edit.headline !== undefined) {
        const headline = edit.headline;
        await ai(() =>
          svc.checkEdit({ text: headline, field: `body.stories.${i}.headline` }, { requestId, userId }),
        );
        patch.headline = headline;
      }
      if (edit.body !== undefined) {
        const storyBody = edit.body;
        await ai(() =>
          svc.checkEdit({ text: storyBody, field: `body.stories.${i}.body` }, { requestId, userId }),
        );
        patch.body = storyBody;
      }
      if (Object.keys(patch).length) {
        unwrap(await serviceDb().from("stories").update(patch).eq("id", edit.id).select("id").single());
      }
    }
  }

  if (body.comic?.title !== undefined) {
    await ai(() =>
      svc.checkEdit({ text: body.comic!.title!, field: "body.comic.title" }, { requestId, userId }),
    );
    unwrap(
      await serviceDb()
        .from("pages")
        .update({ comic_title: body.comic.title })
        .eq("id", pageId)
        .select("id")
        .single(),
    );
  }

  if (body.comic?.panels) {
    const current = unwrap(await serviceDb().from("panels").select("*").eq("page_id", pageId));
    for (const [i, edit] of body.comic.panels.entries()) {
      const row = current.find((p) => p.idx === edit.index);
      if (!row) throw new ApiError("not_found");
      const patch: { caption?: string | null; dialogue?: NonNullable<Json> } = {};
      if (edit.caption !== undefined) {
        if (edit.caption) {
          await ai(() =>
            svc.checkEdit(
              { text: edit.caption!, field: `body.comic.panels.${i}.caption` },
              { requestId, userId },
            ),
          );
        }
        patch.caption = edit.caption;
      }
      if (edit.dialogue) {
        const existing = Array.isArray(row.dialogue) ? row.dialogue : [];
        const next = existing.map((line, idx) => {
          const text = edit.dialogue![idx]?.text;
          if (text === undefined || !line || typeof line !== "object" || Array.isArray(line)) return line;
          return { ...line, text };
        });
        for (const [idx, line] of edit.dialogue.entries()) {
          await ai(() =>
            svc.checkEdit(
              { text: line.text, field: `body.comic.panels.${i}.dialogue.${idx}.text` },
              { requestId, userId },
            ),
          );
        }
        patch.dialogue = next as NonNullable<Json>;
      }
      if (Object.keys(patch).length) {
        unwrap(
          await serviceDb()
            .from("panels")
            .update(patch)
            .eq("page_id", pageId)
            .eq("idx", edit.index)
            .select("page_id")
            .single(),
        );
      }
    }
  }

  unwrap(
    await serviceDb()
      .from("pages")
      .update({ status: "generated", approved_at: null })
      .eq("id", pageId)
      .select("id")
      .single(),
  );
  return assemblePage(await requireAuthor(pageId, userId));
}

export async function drawPanel(
  pageId: string,
  index: number,
  userId: string,
  regenerate: boolean,
  requestId: string,
): Promise<Panel> {
  const page = await requireAuthor(pageId, userId);
  assertWritable((await pageLock(page.id)).locked);
  if (page.status === "writing") throw new ApiError("conflict");
  const panel = unwrapMaybe(
    await serviceDb().from("panels").select("*").eq("page_id", pageId).eq("idx", index).maybeSingle(),
  );
  if (!panel) throw new ApiError("not_found");
  if (panel.status === "ready" && panel.storage_path && !regenerate) {
    const assembled = await assemblePage(page);
    return assembled.comic!.panels[index]!;
  }
  if (page.redraws_used >= PAGE_LIMITS.redraws) throw new ApiError("quota_exceeded");

  unwrap(
    await serviceDb()
      .from("pages")
      .update({ redraws_used: page.redraws_used + 1, status: "generated", approved_at: null })
      .eq("id", pageId)
      .select("id")
      .single(),
  );
  unwrap(
    await serviceDb()
      .from("panels")
      .update({ status: "generating", error: null })
      .eq("page_id", pageId)
      .eq("idx", index)
      .select("page_id")
      .single(),
  );

  try {
    const profile = unwrap(
      await serviceDb().from("profiles").select("name, look, style, avatar_path").eq("id", userId).single(),
    );
    let avatar: { bytes: Uint8Array; mimeType: "image/png" } | undefined;
    if (profile.avatar_path) {
      const bytes = await downloadObject("avatars", profile.avatar_path);
      if (bytes) avatar = { bytes, mimeType: "image/png" as const };
    }
    const image = await ai(() =>
      getAiService().generatePanel(
        {
          scene: panel.scene,
          character: {
            name: profile.name ?? "Friend",
            look: profile.look ?? "a friendly person",
            avatar,
          },
          style: styleConfig(profile.style as StyleKey),
        },
        { requestId, userId },
      ),
    );
    const ext = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
    const path = objectPath(userId, ext);
    await uploadObject("panels", path, image.bytes, image.mimeType);
    unwrap(
      await serviceDb()
        .from("panels")
        .update({ status: "ready", storage_path: path, error: null })
        .eq("page_id", pageId)
        .eq("idx", index)
        .select("page_id")
        .single(),
    );
  } catch (err) {
    const code =
      err instanceof ApiError &&
      (err.code === "content_blocked" || err.code === "provider_unavailable" || err.code === "quota_exceeded")
        ? err.code === "quota_exceeded"
          ? "generation_failed"
          : err.code
        : "generation_failed";
    await serviceDb()
      .from("panels")
      .update({
        status: "failed",
        error: code === "content_blocked" || code === "provider_unavailable" ? code : "generation_failed",
      })
      .eq("page_id", pageId)
      .eq("idx", index);
    throw err;
  }

  const assembled = await assemblePage(await requireAuthor(pageId, userId));
  return assembled.comic!.panels[index]!;
}

export async function reorderPanels(pageId: string, userId: string, order: number[]): Promise<Page> {
  const page = await requireAuthor(pageId, userId);
  assertWritable((await pageLock(page.id)).locked);
  const rows = unwrap(await serviceDb().from("panels").select("*").eq("page_id", pageId));
  if (rows.length !== 4) throw new ApiError("conflict");
  const byIdx = new Map(rows.map((r) => [r.idx, r]));
  for (const [newIdx, oldIdx] of order.entries()) {
    const row = byIdx.get(oldIdx);
    if (!row) throw new ApiError("bad_request");
    unwrap(
      await serviceDb()
        .from("panels")
        .update({ idx: newIdx + 10 })
        .eq("page_id", pageId)
        .eq("idx", oldIdx)
        .select("page_id")
        .single(),
    );
  }
  for (const [newIdx] of order.entries()) {
    unwrap(
      await serviceDb()
        .from("panels")
        .update({ idx: newIdx })
        .eq("page_id", pageId)
        .eq("idx", newIdx + 10)
        .select("page_id")
        .single(),
    );
  }
  unwrap(
    await serviceDb()
      .from("pages")
      .update({ status: "generated", approved_at: null })
      .eq("id", pageId)
      .select("id")
      .single(),
  );
  return assemblePage(await requireAuthor(pageId, userId));
}

export async function approvePage(pageId: string, userId: string): Promise<Page> {
  const page = await requireAuthor(pageId, userId);
  assertWritable((await pageLock(page.id)).locked);
  if (page.status === "writing" || page.notices.includes("stale")) throw new ApiError("conflict");
  unwrap(
    await serviceDb()
      .from("pages")
      .update({ status: "approved", approved_at: page.approved_at ?? new Date().toISOString() })
      .eq("id", pageId)
      .select("id")
      .single(),
  );
  return assemblePage(await requireAuthor(pageId, userId));
}
