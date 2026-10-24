import { z } from "zod";
import type { ZodiacSign } from "@/lib/contract/common";
import type { AvatarTweaks } from "@/lib/contract/profile";

// Interface only. Implementations (stub and real) and the safety layer arrive in Phase 3.

export interface ImageBytes {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

/** Art style for avatars and panels. Owned by design; selected by AI_STYLE_ID. */
export interface StyleConfig {
  styleId: string;
  params?: Record<string, string>;
}

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

export interface ModerationResult {
  decision: ModerationDecision;
  /** Vendor-neutral categories, e.g. "self_harm", "harassment", "grief". */
  categories: string[];
}

/**
 * Low-level, vendor-specific transport. The only layer that knows a vendor exists.
 * It receives prompts that are already built and returns raw output, which the AiService validates.
 */
export interface AiProvider {
  readonly id: string;
  completeJson(
    req: {
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

/**
 * What routes call. Owns prompt building, delimiters, moderation, output validation, grounding
 * checks, retries, fallbacks, timeouts, caps, and the circuit breaker.
 */
export interface AiService {
  generateAvatar(
    input: { selfie: ImageBytes; tweaks?: AvatarTweaks; style: StyleConfig },
    ctx: CallContext,
  ): Promise<ImageBytes>;
  writeEvent(
    input: { text: string; serious: boolean; authorFirstName: string },
    ctx: CallContext,
  ): Promise<WrittenEvent & { moderation: ModerationResult; usedFallback: boolean }>;
  generatePanel(
    input: { avatar: ImageBytes; panel: PanelSpec; serious: boolean; style: StyleConfig },
    ctx: CallContext,
  ): Promise<ImageBytes>;
  generateHoroscope(input: { sign: ZodiacSign; weekStart: string }, ctx: CallContext): Promise<string>;
}
