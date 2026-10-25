import type { StyleKey, ZodiacSign } from "@/lib/contract/common";
import type { StorySection } from "@/lib/contract/pages";
import type { AvatarTraits } from "@/lib/contract/profile";

export interface ImageBytes {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

/** A style preset: the key the person picked and the prompt fragment design owns (see styles.ts). */
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

export const PAGE_AI_LIMITS = {
  highlights: 3,
  panels: 4,
  dialoguePerPanel: 2,
  dialogueWords: 12,
  captionWords: 15,
  headline: 120,
  body: 600,
  title: 80,
  scene: 300,
} as const;

// ---------- Page (what the AiService returns, with real ids) ----------

export interface PageAuthor {
  userId: string;
  /** Display name. The service reduces it to a letters-only first name before use. */
  name: string;
  /** Profile city name, if set. Optional context for headlines ("Austin Resident..."). */
  city?: string | null;
}

export interface PageHighlight {
  id: string;
  text: string;
  serious: boolean;
  /** Forced off for serious highlights. Highlights not in the comic still get a story. */
  inComic: boolean;
}

export interface PageStory {
  highlightId: string;
  section: StorySection;
  headline: string;
  body: string;
}

export interface PagePanel {
  /** What to draw. Server-side only: never shown to readers. */
  scene: string;
  caption: string | null;
  /** Spoken by the page's author. */
  dialogue: Array<{ text: string; side: "left" | "right" }>;
  /** The highlight this panel depicts. Its photos are pinned to the panel. */
  highlightId: string;
}

export interface PageDraft {
  /** One per highlight, in input order. */
  stories: PageStory[];
  comic: { title: string; panels: PagePanel[] } | null;
}

/** The person drawn in a panel: always the page's author. */
export interface PanelCharacter {
  name: string;
  look: string;
  /** Their avatar in their style, if one exists. Sent as a reference image. */
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

export type JsonTask = "page" | "story" | "horoscope";
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
       * Avatar step: the person's photo, if they gave one. Panel step: the person's avatar. Empty
       * means text-only generation.
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

export interface PageResult extends PageDraft {
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
  /** Moderates text the author typed over generated text (headlines, stories, captions). */
  checkEdit(input: { text: string; field: string }, ctx: AiCallContext): Promise<void>;
  /** Turns the trait form into the fixed look text. Moderates the free-text note. */
  describeLook(input: { traits: AvatarTraits }, ctx: AiCallContext): Promise<{ look: string }>;
  generateAvatar(
    input: { look: string; photo?: ImageBytes; style: StyleConfig },
    ctx: AiCallContext,
  ): Promise<ImageBytes>;
  /** One person's page: a story per highlight and a 4-panel comic starring them. */
  writePage(
    input: { weekLabel: string; author: PageAuthor; highlights: PageHighlight[] },
    ctx: AiCallContext,
  ): Promise<PageResult>;
  /** A new story for one highlight, different from the previous headline. */
  rewriteStory(
    input: { weekLabel: string; author: PageAuthor; highlight: PageHighlight; previousHeadline?: string },
    ctx: AiCallContext,
  ): Promise<{ story: PageStory; usedFallback: boolean }>;
  generatePanel(
    input: { scene: string; character: PanelCharacter; style: StyleConfig },
    ctx: AiCallContext,
  ): Promise<ImageBytes>;
  generateHoroscope(input: { sign: ZodiacSign; weekStart: string }, ctx: AiCallContext): Promise<string>;
}
