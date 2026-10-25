import type { ZodiacSign } from "@/lib/contract/common";
import { cleanText } from "@/lib/contract/text";
import { PAGE_AI_LIMITS } from "@/lib/ai/types";
import type { PageCheckInput, RefPage, RefStory } from "./output";
import { containsLink, containsMarkup, redactPersonalData } from "./redact";

const GENERIC = "Shared a moment from the week.";

const FALLBACK_SCENES = [
  "a sunny park, the character smiling and waving, wide shot",
  "a cozy kitchen, the character laughing, medium shot",
  "a busy street, the character cheering, low angle",
  "a bright living room, the character relaxing on a couch, close-up",
];

/** The person's own words, minus personal data and anything that could render as markup. */
export function plainFallbackText(text: string, max: number): string {
  const s = cleanText(
    redactPersonalData(text)
      .text.replace(/\[(?:email|link|phone)\]/g, " ")
      .replace(/[<>{}[\]`\\|*_~#$&]/g, " ")
      .replace(/(^|\n)\s*(?:[-+>]|\d+\.)\s+/g, "$1"),
    "single-line",
  );
  const cut = Array.from(s).slice(0, max).join("").trim();
  if (!cut || containsLink(cut) || containsMarkup(cut)) return GENERIC;
  return cut;
}

/** Safe default for one story: the person's own words under a plain headline. */
export function fallbackStoryFor(input: PageCheckInput, ref: string, index = 0): RefStory {
  const h = input.highlights.find((x) => x.ref === ref)!;
  return {
    highlightRef: ref,
    section: "news",
    headline: index === 0 ? `News from ${input.name}` : `More from ${input.name}`,
    body: plainFallbackText(h.text, PAGE_AI_LIMITS.body),
  };
}

/**
 * Safe default when the page fails validation twice or is blocked by moderation: each story is the
 * person's own words, and the comic uses neutral scenes with no captions or dialogue.
 */
export function fallbackPage(input: PageCheckInput): RefPage {
  const eligible = input.highlights.filter((h) => h.inComic && !h.serious);
  return {
    stories: input.highlights.map((h, i) => fallbackStoryFor(input, h.ref, i)),
    comic: eligible.length
      ? {
          title: `${input.name}'s week`,
          panels: FALLBACK_SCENES.map((scene, i) => ({
            scene,
            caption: null,
            dialogue: [],
            momentRef: eligible[i % eligible.length]!.ref,
          })),
        }
      : null,
  };
}

export function fallbackHoroscope(sign: ZodiacSign): string {
  const name = sign.charAt(0).toUpperCase() + sign.slice(1);
  return `${name}, the stars are taking the week off. Make time for the people who make you laugh.`;
}
