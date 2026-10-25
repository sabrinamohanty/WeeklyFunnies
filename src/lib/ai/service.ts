import { createHash } from "node:crypto";
import { z } from "zod";
import { isoDate, ZODIAC_SIGNS } from "@/lib/contract/common";
import { cleanText, codePointLength, TEXT_LIMITS } from "@/lib/contract/text";
import { log } from "@/lib/log/logger";
import type { RateLimiter } from "@/lib/ratelimit";
import { newBoundary } from "@/lib/safety/delimit";
import { fallbackHoroscope, fallbackStory } from "@/lib/safety/fallback";
import { buildLook } from "@/lib/safety/look";
import {
  checkHoroscopeOutput,
  checkStoryOutput,
  horoscopeOutputSchema,
  storyOutputSchema,
  storyText,
  type RefStory,
  type RejectReason,
  type StoryCheckInput,
} from "@/lib/safety/output";
import {
  buildAvatarImagePrompt,
  buildHoroscopeUserPrompt,
  buildPanelImagePrompt,
  buildStoryUserPrompt,
  HOROSCOPE_SYSTEM_PROMPT,
  STORY_SYSTEM_PROMPT,
} from "@/lib/safety/prompts";
import { redactPersonalData } from "@/lib/safety/redact";
import { AiError } from "./errors";
import { isValidImage } from "./image";
import { CircuitBreaker, CircuitOpenError, Semaphore, TimeoutError, withTimeout } from "./resilience";
import {
  STORY_LIMITS,
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
  type Story,
  type StoryCharacter,
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
const STORY_JSON_SCHEMA = z.toJSONSchema(storyOutputSchema) as Record<string, unknown>;
const HOROSCOPE_JSON_SCHEMA = z.toJSONSchema(horoscopeOutputSchema) as Record<string, unknown>;

/** First word of a display name, letters only, so a name field can't carry instructions. */
export function firstNameOf(name: string): string {
  const first = cleanText(name, "single-line").split(" ")[0] ?? "";
  const letters = first.replace(/[^\p{L}\p{M}'’-]/gu, "").replace(/^[-'’]+|[-'’]+$/g, "");
  return Array.from(letters).slice(0, 30).join("");
}

/** Short, unique, letters-only names for the prompt. Duplicates get a last initial, then a number. */
export function promptNames(fullNames: string[]): string[] {
  const out: string[] = [];
  for (const full of fullNames) {
    const first = firstNameOf(full) || "Friend";
    let name = first;
    if (out.includes(name)) {
      const initial = firstNameOf(cleanText(full, "single-line").split(" ")[1] ?? "")
        .charAt(0)
        .toUpperCase();
      if (initial) name = `${first} ${initial}`;
    }
    for (let n = 2; out.includes(name); n++) name = `${first} ${n}`;
    out.push(name);
  }
  return out;
}

/** Cache key for a panel image: identical style, cast, and scene never pay twice. */
export function panelCacheKey(scene: string, characters: StoryCharacter[], style: StyleConfig): string {
  const cast = characters.map((c) => `${c.name}|${c.look}`).join(";");
  return createHash("sha256").update(`${style.key}\n${cast}\n${scene}`).digest("hex");
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

  function prepareStory(input: Parameters<AiService["writeStory"]>[0]) {
    const { people, highlights } = input;
    if (people.length < 1 || people.length > STORY_LIMITS.people)
      throw new Error("writeStory: people out of range");
    if (highlights.length < 1 || highlights.length > STORY_LIMITS.highlights) {
      throw new Error("writeStory: highlights out of range");
    }
    if (new Set(people.map((p) => p.userId)).size !== people.length)
      throw new Error("writeStory: duplicate people");
    if (new Set(highlights.map((h) => h.id)).size !== highlights.length) {
      throw new Error("writeStory: duplicate highlights");
    }
    const names = promptNames(people.map((p) => p.name));
    const personRef = new Map(people.map((p, i) => [p.userId, `p${i + 1}`]));
    const check: StoryCheckInput = {
      weekLabel: cleanText(input.weekLabel, "single-line").slice(0, 40),
      people: people.map((p, i) => ({ ref: `p${i + 1}`, name: names[i]! })),
      highlights: highlights.map((h, i) => {
        const ref = personRef.get(h.userId);
        const text = cleanText(h.text, "multiline");
        if (!ref) throw new Error("writeStory: highlight author is not in people");
        if (!text || codePointLength(text) > TEXT_LIMITS.highlight)
          throw new Error("writeStory: invalid text");
        return {
          ref: `h${i + 1}`,
          personRef: ref,
          text: redactPersonalData(text).text,
          serious: h.serious,
          inComic: h.inComic,
        };
      }),
    };
    const userIdOf = new Map(people.map((p, i) => [`p${i + 1}`, p.userId]));
    const highlightIdOf = new Map(highlights.map((h, i) => [`h${i + 1}`, h.id]));
    const nameOf = new Map(check.people.map((p) => [p.ref, p.name]));

    const resolve = (s: RefStory): Story => ({
      article: {
        headline: s.article.headline,
        bylineUserId: userIdOf.get(s.article.bylineRef)!,
        byline: nameOf.get(s.article.bylineRef)!,
        body: s.article.body,
      },
      comic: s.comic && {
        title: s.comic.title,
        panels: s.comic.panels.map((p) => ({
          scene: p.scene,
          caption: p.caption,
          dialogue: p.dialogue.map((d) => ({
            speakerUserId: userIdOf.get(d.speakerRef)!,
            speaker: nameOf.get(d.speakerRef)!,
            text: d.text,
            side: d.side,
          })),
          characterUserIds: p.characterRefs.map((r) => userIdOf.get(r)!),
          highlightIds: p.momentRefs.map((r) => highlightIdOf.get(r)!),
        })),
      },
    });
    return { check, resolve };
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

    async writeStory(input, ctx) {
      const { check, resolve } = prepareStory(input);
      await quota("text", ctx);

      const user = buildStoryUserPrompt({ ...check, boundary: boundary() });
      let story: RefStory | undefined;
      for (let attempt = 1; attempt <= 2 && !story; attempt++) {
        const { raw } = await call("text", "story", attempt, ctx, (pctx) =>
          provider.completeJson(
            {
              task: "story",
              system: STORY_SYSTEM_PROMPT,
              user,
              jsonSchema: STORY_JSON_SCHEMA,
              maxOutputTokens: 2_000,
            },
            pctx,
          ),
        );
        const checked = checkStoryOutput(raw, check);
        if (!checked.ok) {
          rejected(ctx, "story", attempt, checked.reason);
          continue;
        }
        const moderation = await moderateText(storyText(checked.value), ctx);
        if (moderation.decision === "block") {
          rejected(ctx, "story", attempt, "moderation");
          break;
        }
        story = checked.value;
      }

      return { ...resolve(story ?? fallbackStory(check)), usedFallback: !story };
    },

    async generatePanel(input, ctx) {
      const scene = cleanText(input.scene, "single-line");
      const { characters } = input;
      if (!scene || codePointLength(scene) > STORY_LIMITS.scene) throw new AiError("generation_failed");
      if (characters.length < 1 || characters.length > STORY_LIMITS.charactersPerPanel) {
        throw new AiError("generation_failed");
      }
      if (characters.some((c) => c.avatar && !isValidImage(c.avatar))) throw new AiError("generation_failed");

      const moderation = await moderateText(scene, ctx);
      if (moderation.decision === "block") throw new AiError("content_blocked", { field: "panel" });
      await quota("image", ctx);

      const references = characters.flatMap((c) => (c.avatar ? [c.avatar] : []));
      return image(
        "panel",
        buildPanelImagePrompt(scene, characters, input.style),
        references,
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
