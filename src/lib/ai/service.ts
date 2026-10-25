import { z } from "zod";
import { isoDate, ZODIAC_SIGNS } from "@/lib/contract/common";
import { cleanText, codePointLength, TEXT_LIMITS } from "@/lib/contract/text";
import { log } from "@/lib/log/logger";
import type { RateLimiter } from "@/lib/ratelimit";
import { newBoundary } from "@/lib/safety/delimit";
import { fallbackEvent, fallbackHoroscope } from "@/lib/safety/fallback";
import {
  checkHoroscopeOutput,
  checkWriterOutput,
  horoscopeOutputSchema,
  panelDescription,
  writerOutputSchema,
  type RejectReason,
} from "@/lib/safety/output";
import {
  buildAvatarImagePrompt,
  buildHoroscopeUserPrompt,
  buildPanelImagePrompt,
  buildWriterUserPrompt,
  HOROSCOPE_SYSTEM_PROMPT,
  WRITER_SYSTEM_PROMPT,
} from "@/lib/safety/prompts";
import { redactPersonalData } from "@/lib/safety/redact";
import { AiError } from "./errors";
import { isValidImage } from "./image";
import { CircuitBreaker, CircuitOpenError, Semaphore, TimeoutError, withTimeout } from "./resilience";
import {
  panelSpecSchema,
  SERIOUS_MOODS,
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
  type StyleConfig,
  type WrittenEvent,
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
const WRITER_JSON_SCHEMA = z.toJSONSchema(writerOutputSchema) as Record<string, unknown>;
const HOROSCOPE_JSON_SCHEMA = z.toJSONSchema(horoscopeOutputSchema) as Record<string, unknown>;

/** First word of a display name, letters only, so a name field can't carry instructions. */
export function firstNameOf(name: string): string {
  const first = cleanText(name, "single-line").split(" ")[0] ?? "";
  const letters = first.replace(/[^\p{L}\p{M}'’-]/gu, "").replace(/^[-'’]+|[-'’]+$/g, "");
  return Array.from(letters).slice(0, 30).join("");
}

type Op = "text" | "image" | "moderation";

function outcomeOf(err: unknown): string {
  if (err instanceof TimeoutError) return "timeout";
  if (err instanceof CircuitOpenError) return "circuit_open";
  return "error";
}

export function createAiService(deps: AiServiceDeps): AiService {
  const { provider, moderator, limiter, settings } = deps;
  const now = deps.now ?? Date.now;
  const boundary = deps.boundary ?? newBoundary;
  const semaphore = new Semaphore(settings.maxConcurrency);
  const breakers: Record<Op, CircuitBreaker> = {
    text: new CircuitBreaker(settings.circuitFailureThreshold, settings.circuitCooldownMs, now),
    image: new CircuitBreaker(settings.circuitFailureThreshold, settings.circuitCooldownMs, now),
    moderation: new CircuitBreaker(settings.circuitFailureThreshold, settings.circuitCooldownMs, now),
  };

  /** Every outbound call: bounded concurrency, circuit breaker, deadline, metadata-only logging. */
  async function call<T extends { meta?: CallMeta }>(
    op: Op,
    task: JsonTask | ImageTask | "moderate",
    attempt: number,
    ctx: AiCallContext,
    fn: (pctx: CallContext) => Promise<T>,
  ): Promise<T> {
    const started = now();
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
        provider: result.meta?.provider ?? (op === "moderation" ? moderator.id : provider.id),
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
        provider: op === "moderation" ? moderator.id : provider.id,
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

  /** Fails closed: if moderation can't run, nothing is generated. */
  async function moderate(text: string, ctx: AiCallContext): Promise<ModerationResult> {
    const result = await call("moderation", "moderate", 1, ctx, async (pctx) => ({
      ...(await moderator.checkText(text, pctx)),
      meta: undefined,
    }));
    log.info("ai_moderation", {
      requestId: ctx.requestId,
      decision: result.decision,
      categoryCount: result.categories.length,
    });
    return { decision: result.decision, categories: result.categories };
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
    reference: ImageBytes,
    style: StyleConfig,
    ctx: AiCallContext,
  ): Promise<ImageBytes> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { image } = await call("image", task, attempt, ctx, (pctx) =>
        provider.generateImage({ task, prompt, reference, style }, pctx),
      );
      if (isValidImage(image)) return { bytes: image.bytes, mimeType: image.mimeType };
      rejected(ctx, task, attempt, "image");
    }
    throw new AiError("generation_failed");
  }

  return {
    async writeEvent(input, ctx) {
      const text = cleanText(input.text, "multiline");
      if (!text || codePointLength(text) > TEXT_LIMITS.highlight) throw new Error("writeEvent: invalid text");
      const authorFirstName = firstNameOf(input.authorFirstName);
      const source = redactPersonalData(text).text;

      const moderation = await moderate(source, ctx);
      if (moderation.decision === "block") {
        throw new AiError("content_blocked", {
          reason: moderation.categories.includes("self_harm") ? "self_harm" : undefined,
          field: "body.text",
        });
      }
      const serious = input.serious || moderation.decision === "sensitive";
      await quota("text", ctx);

      const user = buildWriterUserPrompt({ text: source, authorFirstName, serious, boundary: boundary() });
      let written: WrittenEvent | undefined;
      for (let attempt = 1; attempt <= 2 && !written; attempt++) {
        const { raw } = await call("text", "write_event", attempt, ctx, (pctx) =>
          provider.completeJson(
            {
              task: "write_event",
              system: WRITER_SYSTEM_PROMPT,
              user,
              jsonSchema: WRITER_JSON_SCHEMA,
              maxOutputTokens: 600,
            },
            pctx,
          ),
        );
        const checked = checkWriterOutput(raw, { source, authorFirstName, serious });
        if (!checked.ok) {
          rejected(ctx, "write_event", attempt, checked.reason);
          continue;
        }
        const out = checked.value;
        const outMod = await moderate(`${out.headline}\n${out.article}\n${panelDescription(out.panel)}`, ctx);
        if (outMod.decision === "block") {
          rejected(ctx, "write_event", attempt, "moderation");
          break;
        }
        written = out;
      }

      const usedFallback = !written;
      return {
        ...(written ?? fallbackEvent(text, authorFirstName, serious)),
        serious,
        moderation,
        usedFallback,
      };
    },

    async generatePanel(input, ctx) {
      const parsed = panelSpecSchema.safeParse(input.panel);
      if (!parsed.success) throw new AiError("generation_failed");
      const panel = parsed.data;
      if (input.serious && !SERIOUS_MOODS.includes(panel.mood)) panel.mood = "calm";
      if (!isValidImage(input.avatar)) throw new AiError("generation_failed");

      const moderation = await moderate(panelDescription(panel), ctx);
      if (moderation.decision === "block") throw new AiError("content_blocked", { field: "panel" });
      await quota("image", ctx);

      return image(
        "panel",
        buildPanelImagePrompt(panel, input.serious, input.style),
        input.avatar,
        input.style,
        ctx,
      );
    },

    async generateAvatar(input, ctx) {
      if (!isValidImage(input.selfie)) throw new AiError("generation_failed");
      let note: string | undefined;
      if (input.tweaks?.note) {
        const cleaned = redactPersonalData(cleanText(input.tweaks.note, "single-line"))
          .text.replace(/\[(?:email|link|phone)\]/g, " ")
          .trim();
        if (cleaned) {
          const moderation = await moderate(cleaned, ctx);
          if (moderation.decision === "block") {
            throw new AiError("content_blocked", {
              reason: moderation.categories.includes("self_harm") ? "self_harm" : undefined,
              field: "body.tweaks.note",
            });
          }
          note = cleaned;
        }
      }
      await quota("image", ctx);
      const prompt = buildAvatarImagePrompt({ ...input.tweaks, note }, input.style);
      return image("avatar", prompt, input.selfie, input.style, ctx);
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
          const moderation = await moderate(checked.value, ctx);
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
