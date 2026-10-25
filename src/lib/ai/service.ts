import { createHash } from "node:crypto";
import { z } from "zod";
import { isoDate, ZODIAC_SIGNS } from "@/lib/contract/common";
import { cleanText, codePointLength, TEXT_LIMITS } from "@/lib/contract/text";
import { log } from "@/lib/log/logger";
import type { RateLimiter } from "@/lib/ratelimit";
import { newBoundary } from "@/lib/safety/delimit";
import { fallbackHoroscope, fallbackPage, fallbackStoryFor } from "@/lib/safety/fallback";
import { buildLook } from "@/lib/safety/look";
import {
  checkHoroscopeOutput,
  checkPageOutput,
  checkStoryOutput,
  horoscopeOutputSchema,
  pageOutputSchema,
  pageText,
  storyOutputSchema,
  type PageCheckInput,
  type RefPage,
  type RefStory,
  type RejectReason,
} from "@/lib/safety/output";
import {
  buildAvatarImagePrompt,
  buildHoroscopeUserPrompt,
  buildPageUserPrompt,
  buildPanelImagePrompt,
  buildStoryUserPrompt,
  HOROSCOPE_SYSTEM_PROMPT,
  PAGE_SYSTEM_PROMPT,
  STORY_SYSTEM_PROMPT,
} from "@/lib/safety/prompts";
import { redactPersonalData, toPromptSafe } from "@/lib/safety/redact";
import { AiError } from "./errors";
import { isValidImage } from "./image";
import { CircuitBreaker, CircuitOpenError, Semaphore, TimeoutError, withTimeout } from "./resilience";
import {
  PAGE_AI_LIMITS,
  type AiCallContext,
  type AiProvider,
  type AiService,
  type CallContext,
  type CallMeta,
  type ImageBytes,
  type ImageTask,
  type JsonTask,
  type ModerationResult,
  type Moderator,
  type PageAuthor,
  type PageDraft,
  type PageHighlight,
  type PageStory,
  type PanelCharacter,
  type StyleConfig,
} from "./types";

export interface AiSettings {
  timeoutMs: number;
  maxConcurrency: number;
  dailyTextCalls: number;
  dailyImageCalls: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
}

export interface AiServiceDeps {
  provider: AiProvider;
  moderator: Moderator;
  limiter: RateLimiter;
  settings: AiSettings;
  now?: () => number;
  boundary?: () => string;
}

const DAY_MS = 86_400_000;
const PAGE_JSON_SCHEMA = z.toJSONSchema(pageOutputSchema) as Record<string, unknown>;
const STORY_JSON_SCHEMA = z.toJSONSchema(storyOutputSchema) as Record<string, unknown>;
const HOROSCOPE_JSON_SCHEMA = z.toJSONSchema(horoscopeOutputSchema) as Record<string, unknown>;

/** First word of a display name, letters only, so a name field can't carry instructions. */
export function firstNameOf(name: string): string {
  const first = cleanText(name, "single-line").split(" ")[0] ?? "";
  const letters = first.replace(/[^\p{L}\p{M}'’-]/gu, "").replace(/^[-'’]+|[-'’]+$/g, "");
  return Array.from(letters).slice(0, 30).join("");
}

/** Cache key for a panel image: identical style, character, and scene never pay twice. */
export function panelCacheKey(scene: string, character: PanelCharacter, style: StyleConfig): string {
  return createHash("sha256")
    .update(`${style.key}\n${character.name}|${character.look}\n${scene}`)
    .digest("hex");
}

/**
 * What the model sees for a page, with refs (h1, h2) in place of ids: the author's letters-only
 * first name, a prompt-safe city, and redacted highlight texts. Also used for grounding checks.
 */
export function preparePage(input: { weekLabel: string; author: PageAuthor; highlights: PageHighlight[] }): {
  check: PageCheckInput;
  idOf: Map<string, string>;
} {
  const { highlights } = input;
  if (highlights.length < 1 || highlights.length > PAGE_AI_LIMITS.highlights) {
    throw new Error("writePage: highlights out of range");
  }
  if (new Set(highlights.map((h) => h.id)).size !== highlights.length) {
    throw new Error("writePage: duplicate highlights");
  }
  const city = input.author.city ? toPromptSafe(redactPersonalData(input.author.city).text, 60) : "";
  const check: PageCheckInput = {
    weekLabel: cleanText(input.weekLabel, "single-line").slice(0, 40),
    name: firstNameOf(input.author.name) || "Friend",
    city: city || null,
    highlights: highlights.map((h, i) => {
      const text = cleanText(h.text, "multiline");
      if (!text || codePointLength(text) > TEXT_LIMITS.highlight) throw new Error("writePage: invalid text");
      return {
        ref: `h${i + 1}`,
        text: redactPersonalData(text).text,
        serious: h.serious,
        inComic: h.inComic && !h.serious,
      };
    }),
  };
  return { check, idOf: new Map(highlights.map((h, i) => [`h${i + 1}`, h.id])) };
}

function resolveStory(st: RefStory, idOf: Map<string, string>): PageStory {
  return {
    highlightId: idOf.get(st.highlightRef)!,
    section: st.section,
    headline: st.headline,
    body: st.body,
  };
}

function resolvePage(p: RefPage, idOf: Map<string, string>): PageDraft {
  return {
    stories: p.stories.map((st) => resolveStory(st, idOf)),
    comic: p.comic && {
      title: p.comic.title,
      panels: p.comic.panels.map((panel) => ({
        scene: panel.scene,
        caption: panel.caption,
        dialogue: panel.dialogue,
        highlightId: idOf.get(panel.momentRef)!,
      })),
    },
  };
}

type Op = "text" | "image" | "moderation";

function outcomeOf(err: unknown): string {
  if (err instanceof TimeoutError) return "timeout";
  if (err instanceof CircuitOpenError) return "circuit_open";
  return "error";
}

function blocked(m: ModerationResult, field: string): AiError {
  return new AiError("content_blocked", {
    reason: m.categories.includes("self_harm") ? "self_harm" : undefined,
    field,
  });
}

export function createAiService(deps: AiServiceDeps): AiService {
  const { provider, moderator, limiter, settings } = deps;
  const now = deps.now ?? Date.now;
  const boundary = deps.boundary ?? newBoundary;
  const semaphore = new Semaphore(settings.maxConcurrency);
  const breaker = () => new CircuitBreaker(settings.circuitFailureThreshold, settings.circuitCooldownMs, now);
  const breakers: Record<Op, CircuitBreaker> = { text: breaker(), image: breaker(), moderation: breaker() };

  /** Every outbound call: bounded concurrency, circuit breaker, deadline, metadata-only logging. */
  async function call<T extends { meta?: CallMeta }>(
    op: Op,
    task: JsonTask | ImageTask | "moderate_text" | "moderate_image",
    attempt: number,
    ctx: AiCallContext,
    fn: (pctx: CallContext) => Promise<T>,
  ): Promise<T> {
    const started = now();
    const vendor = op === "moderation" ? moderator.id : provider.id;
    try {
      const result = await withTimeout(
        (signal) =>
          semaphore.run(
            () =>
              breakers[op].run(() => fn({ requestId: ctx.requestId, signal, timeoutMs: settings.timeoutMs })),
            signal,
          ),
        settings.timeoutMs,
        ctx.signal,
      );
      log.info("ai_call", {
        requestId: ctx.requestId,
        task,
        attempt,
        outcome: "ok",
        provider: result.meta?.provider ?? vendor,
        model: result.meta?.model,
        latencyMs: now() - started,
        inputTokenCount: result.meta?.inputTokens,
        outputTokenCount: result.meta?.outputTokens,
      });
      return result;
    } catch (err) {
      log.warn("ai_call", {
        requestId: ctx.requestId,
        task,
        attempt,
        outcome: outcomeOf(err),
        provider: vendor,
        latencyMs: now() - started,
        errorName: err instanceof Error ? err.name : "unknown",
      });
      throw new AiError("provider_unavailable", { cause: err });
    }
  }

  function rejected(
    ctx: AiCallContext,
    task: JsonTask | ImageTask,
    attempt: number,
    reason: RejectReason | "image",
  ) {
    log.warn("ai_output_rejected", { requestId: ctx.requestId, task, attempt, rejectReason: reason });
  }

  function logModeration(ctx: AiCallContext, r: ModerationResult) {
    log.info("ai_moderation", {
      requestId: ctx.requestId,
      decision: r.decision,
      categoryCount: r.categories.length,
    });
  }

  /** Fails closed: if moderation can't run, nothing is generated. */
  async function moderateText(text: string, ctx: AiCallContext): Promise<ModerationResult> {
    const r = await call("moderation", "moderate_text", 1, ctx, async (pctx) => ({
      ...(await moderator.checkText(text, pctx)),
      meta: undefined,
    }));
    logModeration(ctx, r);
    return { decision: r.decision, categories: r.categories };
  }

  async function moderateImage(image: ImageBytes, ctx: AiCallContext): Promise<ModerationResult> {
    const r = await call("moderation", "moderate_image", 1, ctx, async (pctx) => ({
      ...(await moderator.checkImage(image, pctx)),
      meta: undefined,
    }));
    logModeration(ctx, r);
    return { decision: r.decision, categories: r.categories };
  }

  async function quota(kind: "text" | "image", ctx: AiCallContext): Promise<void> {
    if (!ctx.userId) return;
    const cap = kind === "text" ? settings.dailyTextCalls : settings.dailyImageCalls;
    const r = await limiter.consume(`ai:${kind}:${ctx.userId}`, cap, DAY_MS);
    if (!r.allowed) throw new AiError("quota_exceeded", { retryAfterSeconds: r.retryAfterSeconds });
  }

  /** Generates an image and checks its bytes; one retry on invalid output. */
  async function image(
    task: ImageTask,
    prompt: string,
    references: ImageBytes[],
    style: StyleConfig,
    ctx: AiCallContext,
  ): Promise<ImageBytes> {
    const aspectRatio = task === "avatar" ? "1:1" : "4:3";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { image } = await call("image", task, attempt, ctx, (pctx) =>
        provider.generateImage({ task, prompt, references, aspectRatio, style }, pctx),
      );
      if (isValidImage(image)) return { bytes: image.bytes, mimeType: image.mimeType };
      rejected(ctx, task, attempt, "image");
    }
    throw new AiError("generation_failed");
  }

  /** Asks for JSON, validates it, moderates it; one retry. Returns undefined if nothing passed. */
  async function generateJson<T>(
    task: "page" | "story",
    req: { system: string; user: string; jsonSchema: Record<string, unknown>; maxOutputTokens: number },
    validate: (raw: unknown) => { ok: true; value: T } | { ok: false; reason: RejectReason },
    textOf: (value: T) => string,
    ctx: AiCallContext,
  ): Promise<T | undefined> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { raw } = await call("text", task, attempt, ctx, (pctx) =>
        provider.completeJson({ task, ...req }, pctx),
      );
      const checked = validate(raw);
      if (!checked.ok) {
        rejected(ctx, task, attempt, checked.reason);
        continue;
      }
      const moderation = await moderateText(textOf(checked.value), ctx);
      if (moderation.decision === "block") {
        rejected(ctx, task, attempt, "moderation");
        return undefined;
      }
      return checked.value;
    }
    return undefined;
  }

  return {
    async checkHighlight(input, ctx) {
      const text = cleanText(input.text, "multiline");
      if (!text) throw new Error("checkHighlight: empty text");
      const moderation = await moderateText(redactPersonalData(text).text, ctx);
      if (moderation.decision === "block") throw blocked(moderation, "body.text");
      return { serious: moderation.decision === "sensitive", moderation };
    },

    async checkPhoto(input, ctx) {
      if (!isValidImage(input.image)) throw new Error("checkPhoto: not an image");
      const moderation = await moderateImage(input.image, ctx);
      if (moderation.decision === "block") throw blocked(moderation, "body.photo");
    },

    async describeLook(input, ctx) {
      let note: string | undefined;
      if (input.traits.note) {
        const cleaned = redactPersonalData(cleanText(input.traits.note, "single-line"))
          .text.replace(/\[(?:email|link|phone)\]/g, " ")
          .trim();
        if (cleaned) {
          const moderation = await moderateText(cleaned, ctx);
          if (moderation.decision === "block") throw blocked(moderation, "body.traits.note");
          note = cleaned;
        }
      }
      return { look: buildLook(input.traits, note) };
    },

    async generateAvatar(input, ctx) {
      if (!input.look.trim()) throw new AiError("generation_failed");
      const references: ImageBytes[] = [];
      if (input.photo) {
        if (!isValidImage(input.photo)) throw new AiError("generation_failed");
        const moderation = await moderateImage(input.photo, ctx);
        if (moderation.decision === "block") throw blocked(moderation, "body.photo");
        references.push(input.photo);
      }
      await quota("image", ctx);
      return image("avatar", buildAvatarImagePrompt(input.look, input.style), references, input.style, ctx);
    },

    async checkEdit(input, ctx) {
      const text = cleanText(input.text, "multiline");
      if (!text) return;
      const moderation = await moderateText(redactPersonalData(text).text, ctx);
      if (moderation.decision === "block") throw blocked(moderation, input.field);
    },

    async writePage(input, ctx) {
      const { check, idOf } = preparePage(input);
      await quota("text", ctx);
      const page = await generateJson(
        "page",
        {
          system: PAGE_SYSTEM_PROMPT,
          user: buildPageUserPrompt({ ...check, boundary: boundary() }),
          jsonSchema: PAGE_JSON_SCHEMA,
          maxOutputTokens: 2_000,
        },
        (raw) => checkPageOutput(raw, check),
        pageText,
        ctx,
      );
      return { ...resolvePage(page ?? fallbackPage(check), idOf), usedFallback: !page };
    },

    async rewriteStory(input, ctx) {
      const { check, idOf } = preparePage({ ...input, highlights: [input.highlight] });
      const previous = input.previousHeadline
        ? toPromptSafe(input.previousHeadline, PAGE_AI_LIMITS.headline)
        : undefined;
      await quota("text", ctx);
      const story = await generateJson(
        "story",
        {
          system: STORY_SYSTEM_PROMPT,
          user: buildStoryUserPrompt({ ...check, previousHeadline: previous, boundary: boundary() }),
          jsonSchema: STORY_JSON_SCHEMA,
          maxOutputTokens: 500,
        },
        (raw) => checkStoryOutput(raw, check),
        (st) => `${st.headline}\n${st.body}`,
        ctx,
      );
      const chosen = story ?? fallbackStoryFor(check, "h1");
      return { story: resolveStory(chosen, idOf), usedFallback: !story };
    },

    async generatePanel(input, ctx) {
      const scene = cleanText(input.scene, "single-line");
      const { character } = input;
      if (!scene || codePointLength(scene) > PAGE_AI_LIMITS.scene) throw new AiError("generation_failed");
      if (!character.look.trim()) throw new AiError("generation_failed");
      if (character.avatar && !isValidImage(character.avatar)) throw new AiError("generation_failed");

      const moderation = await moderateText(scene, ctx);
      if (moderation.decision === "block") throw new AiError("content_blocked", { field: "panel" });
      await quota("image", ctx);

      return image(
        "panel",
        buildPanelImagePrompt(
          scene,
          { ...character, name: firstNameOf(character.name) || "Friend" },
          input.style,
        ),
        character.avatar ? [character.avatar] : [],
        input.style,
        ctx,
      );
    },

    async generateHoroscope(input, ctx) {
      const sign = z.enum(ZODIAC_SIGNS).parse(input.sign);
      const weekStart = isoDate.parse(input.weekStart);
      for (let attempt = 1; attempt <= 2; attempt++) {
        const { raw } = await call("text", "horoscope", attempt, ctx, (pctx) =>
          provider.completeJson(
            {
              task: "horoscope",
              system: HOROSCOPE_SYSTEM_PROMPT,
              user: buildHoroscopeUserPrompt(sign, weekStart),
              jsonSchema: HOROSCOPE_JSON_SCHEMA,
              maxOutputTokens: 200,
            },
            pctx,
          ),
        );
        const checked = checkHoroscopeOutput(raw);
        if (checked.ok) {
          const moderation = await moderateText(checked.value, ctx);
          if (moderation.decision !== "block") return checked.value;
          rejected(ctx, "horoscope", attempt, "moderation");
          break;
        }
        rejected(ctx, "horoscope", attempt, checked.reason);
      }
      return fallbackHoroscope(sign);
    },
  };
}
