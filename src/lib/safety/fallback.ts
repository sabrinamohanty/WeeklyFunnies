import type { ZodiacSign } from "@/lib/contract/common";
import { cleanText, TEXT_LIMITS } from "@/lib/contract/text";
import type { PanelSpec, WrittenEvent } from "@/lib/ai/types";
import { containsLink, containsMarkup, redactPersonalData } from "./redact";

export const FALLBACK_PANEL_LIGHT: PanelSpec = {
  setting: "a sunny park",
  action: "smiling and waving",
  mood: "joyful",
  props: [],
};

export const FALLBACK_PANEL_SERIOUS: PanelSpec = {
  setting: "a quiet room with soft light",
  action: "sitting peacefully by a window",
  mood: "reflective",
  props: [],
};

const GENERIC_ARTICLE = "Shared a moment from the week.";

/** The person's own words, minus personal data and anything that could render as markup. */
export function plainFallbackArticle(text: string): string {
  const s = cleanText(
    redactPersonalData(text)
      .text.replace(/\[(?:email|link|phone)\]/g, " ")
      .replace(/[<>{}[\]`\\|*_~#$&]/g, " ")
      .replace(/(^|\n)\s*(?:[-+>]|\d+\.)\s+/g, "$1"),
    "single-line",
  );
  const cut = Array.from(s).slice(0, TEXT_LIMITS.article).join("").trim();
  if (!cut || containsLink(cut) || containsMarkup(cut)) return GENERIC_ARTICLE;
  return cut;
}

/** Safe default when the writer's output fails validation twice or is blocked by moderation. */
export function fallbackEvent(text: string, authorFirstName: string, serious: boolean): WrittenEvent {
  return {
    headline: authorFirstName ? `${authorFirstName}'s week` : "A week to remember",
    article: plainFallbackArticle(text),
    panel: serious ? FALLBACK_PANEL_SERIOUS : FALLBACK_PANEL_LIGHT,
  };
}

export function fallbackHoroscope(sign: ZodiacSign): string {
  const name = sign.charAt(0).toUpperCase() + sign.slice(1);
  return `${name}, the stars are taking the week off. Make time for the people who make you laugh.`;
}
