import { z } from "zod";
import type { ZodiacSign } from "@/lib/contract/common";
import type { AvatarTweaks } from "@/lib/contract/profile";

export interface ImageBytes {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

/** Art style for avatars and panels. Owned by design; selected by AI_STYLE_ID. */
export interface StyleConfig {
  styleId: string;
  params?: Record<string, string>;
}

/** What routes and jobs pass to the AiService. */
export interface AiCallContext {
  requestId: string;
  /** Used for per-user daily caps. Never sent to a provider. Omitted for system work (horoscopes). */
  userId?: string;
  signal?: AbortSignal;
}

/** What providers and moderators receive: no user ids, no emails, nothing beyond the call itself. */
export interface CallContext {
  requestId: string;
  signal: AbortSignal;
  timeoutMs: number;
}

/** Metadata about a provider call. This is all that is ever logged. */
export interface CallMeta {
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export const MOODS = [
  "joyful",
  "proud",
  "relaxed",
  "excited",
  "silly",
  "cozy",
  "determined",
  "calm",
  "reflective",
] as const;
export type Mood = (typeof MOODS)[number];

/** Moods allowed for serious events. */
export const SERIOUS_MOODS: readonly Mood[] = ["calm", "reflective"];

/** Structured comic panel description. The image prompt is built from these fields by a fixed template. */
export const panelSpecSchema = z.strictObject({
  setting: z.string().min(1).max(80),
  action: z.string().min(1).max(120),
  mood: z.enum(MOODS),
  props: z.array(z.string().min(1).max(30)).max(3),
});
export type PanelSpec = z.infer<typeof panelSpecSchema>;

export interface WrittenEvent {
  headline: string;
  article: string;
  panel: PanelSpec;
}

export type ModerationDecision = "allow" | "sensitive" | "block";

/** Vendor-neutral categories. Real moderators map their vendor's labels onto these. */
export const MODERATION_CATEGORIES = [
  "self_harm",
  "violence",
  "harassment",
  "hate",
  "sexual",
  "profanity",
  "grief",
  "illness",
  "breakup",
  "job_loss",
] as const;
export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

export interface ModerationResult {
  decision: ModerationDecision;
  categories: ModerationCategory[];
}

export type JsonTask = "write_event" | "horoscope";
export type ImageTask = "avatar" | "panel";

/**
 * Low-level, vendor-specific transport. The only layer that knows a vendor exists.
 * It receives prompts that are already built and returns raw output, which the AiService validates.
 */
export interface AiProvider {
  readonly id: string;
  completeJson(
    req: {
      task: JsonTask;
      /** Fixed instructions. Never contains user text. */
      system: string;
      /** Untrusted data, wrapped in delimiters by the prompt builder. */
      user: string;
      jsonSchema: Record<string, unknown>;
      maxOutputTokens: number;
    },
    ctx: CallContext,
  ): Promise<{ raw: unknown; meta: CallMeta }>;
  generateImage(
    req: {
      task: ImageTask;
      /** Built from validated fields by a fixed template. Never raw user text. */
      prompt: string;
      /** The selfie (avatar step only) or the approved avatar (panel step). */
      reference: ImageBytes;
      style: StyleConfig;
      seed?: number;
    },
    ctx: CallContext,
  ): Promise<{ image: ImageBytes; meta: CallMeta }>;
}

/** Vendor-neutral moderation, selected by MODERATION_PROVIDER. */
export interface Moderator {
  readonly id: string;
  checkText(text: string, ctx: CallContext): Promise<ModerationResult>;
}

export interface WriteEventResult extends WrittenEvent {
  /** True if the input was sensitive and serious treatment was forced on. */
  serious: boolean;
  moderation: ModerationResult;
  usedFallback: boolean;
}

/**
 * What routes call. Owns prompt building, delimiters, moderation, output validation, grounding
 * checks, retries, fallbacks, timeouts, caps, and the circuit breaker. Throws AiError.
 */
export interface AiService {
  generateAvatar(
    input: { selfie: ImageBytes; tweaks?: AvatarTweaks; style: StyleConfig },
    ctx: AiCallContext,
  ): Promise<ImageBytes>;
  writeEvent(
    input: { text: string; serious: boolean; authorFirstName: string },
    ctx: AiCallContext,
  ): Promise<WriteEventResult>;
  generatePanel(
    input: { avatar: ImageBytes; panel: PanelSpec; serious: boolean; style: StyleConfig },
    ctx: AiCallContext,
  ): Promise<ImageBytes>;
  generateHoroscope(input: { sign: ZodiacSign; weekStart: string }, ctx: AiCallContext): Promise<string>;
}
