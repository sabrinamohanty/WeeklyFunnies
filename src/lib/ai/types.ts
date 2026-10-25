import type { StyleKey, ZodiacSign } from "@/lib/contract/common";
import type { AvatarTraits } from "@/lib/contract/profile";

export interface ImageBytes {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

/** A style preset: the key the paper stores and the prompt fragment design owns (see styles.ts). */
export interface StyleConfig {
  key: StyleKey;
  fragment: string;
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

export const STORY_LIMITS = {
  people: 8,
  highlights: 24,
  panels: 4,
  dialoguePerPanel: 2,
  dialogueWords: 12,
  captionWords: 15,
  charactersPerPanel: 2,
  paragraphsMin: 3,
  paragraphsMax: 5,
  headline: 120,
  title: 80,
  body: 1_500,
  scene: 300,
} as const;

// ---------- Story (what the AiService returns, with real ids) ----------

export interface StoryDialogue {
  speakerUserId: string;
  speaker: string;
  text: string;
  side: "left" | "right";
}

export interface StoryPanel {
  /** What to draw. Server-side only: never shown to readers. */
  scene: string;
  caption: string | null;
  dialogue: StoryDialogue[];
  characterUserIds: string[];
  /** The highlights this panel depicts. Their photos are pinned to the panel. */
  highlightIds: string[];
}

export interface Story {
  article: { headline: string; bylineUserId: string; byline: string; body: string };
  comic: { title: string; panels: StoryPanel[] } | null;
}

export interface StoryPerson {
  userId: string;
  /** Display name. The service reduces it to a letters-only first name before use. */
  name: string;
}

export interface StoryHighlight {
  id: string;
  userId: string;
  text: string;
  serious: boolean;
  /** False for serious highlights by default. These appear in the article only, never the comic. */
  inComic: boolean;
}

export interface StoryCharacter {
  name: string;
  look: string;
  /** The character's avatar in the paper's style, if one exists. Sent as a reference image. */
  avatar?: ImageBytes;
}

// ---------- Moderation ----------

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

// ---------- Provider and moderator (vendor layer) ----------

export type JsonTask = "story" | "horoscope";
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
      /**
       * Avatar step: the person's photo, if they gave one. Panel step: the avatars of the characters
       * in frame. Empty means text-only generation.
       */
      references: ImageBytes[];
      aspectRatio: "1:1" | "4:3";
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
  checkImage(image: ImageBytes, ctx: CallContext): Promise<ModerationResult>;
}

// ---------- Service (what routes call) ----------

export interface StoryResult extends Story {
  usedFallback: boolean;
}

/**
 * Owns prompt building, delimiters, moderation, output validation, grounding checks, retries,
 * fallbacks, timeouts, caps, and the circuit breaker. Throws AiError.
 */
export interface AiService {
  /** Moderates a highlight when it's written. Blocks, or reports that it should be treated as serious. */
  checkHighlight(
    input: { text: string },
    ctx: AiCallContext,
  ): Promise<{ serious: boolean; moderation: ModerationResult }>;
  /** Moderates an uploaded photo before it's stored or sent to any model. */
  checkPhoto(input: { image: ImageBytes }, ctx: AiCallContext): Promise<void>;
  /** Turns the trait form into the fixed look text. Moderates the free-text note. */
  describeLook(input: { traits: AvatarTraits }, ctx: AiCallContext): Promise<{ look: string }>;
  generateAvatar(
    input: { look: string; photo?: ImageBytes; style: StyleConfig },
    ctx: AiCallContext,
  ): Promise<ImageBytes>;
  /** One article and one 4-panel comic for the whole edition. */
  writeStory(
    input: { weekLabel: string; people: StoryPerson[]; highlights: StoryHighlight[] },
    ctx: AiCallContext,
  ): Promise<StoryResult>;
  generatePanel(
    input: { scene: string; characters: StoryCharacter[]; style: StyleConfig },
    ctx: AiCallContext,
  ): Promise<ImageBytes>;
  generateHoroscope(input: { sign: ZodiacSign; weekStart: string }, ctx: AiCallContext): Promise<string>;
}
