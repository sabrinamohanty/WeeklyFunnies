import type { ZodiacSign } from "@/lib/contract/common";
import { cleanText, codePointLength } from "@/lib/contract/text";
import { STORY_LIMITS } from "@/lib/ai/types";
import type { RefStory, StoryCheckInput } from "./output";
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

/**
 * Safe default when the story fails validation twice or is blocked by moderation: the article is
 * each person's own words, and the comic uses neutral scenes with no captions or dialogue.
 */
export function fallbackStory(input: StoryCheckInput): RefStory {
  const authors = input.people.filter((p) => input.highlights.some((h) => h.personRef === p.ref));
  const perParagraph = Math.floor(STORY_LIMITS.body / Math.max(1, authors.length)) - 4;
  const paragraphs = authors.map((p) => {
    const words = input.highlights
      .filter((h) => h.personRef === p.ref)
      .map((h) => h.text)
      .join(". ");
    return `${p.name}: ${plainFallbackText(words, Math.max(40, perParagraph - codePointLength(p.name) - 2))}`;
  });
  const body = Array.from(paragraphs.join("\n\n")).slice(0, STORY_LIMITS.body).join("") || GENERIC;

  const comicHighlights = input.highlights.filter((h) => h.inComic && !h.serious);
  const comic: RefStory["comic"] = comicHighlights.length
    ? {
        title: "Meanwhile, this week",
        panels: FALLBACK_SCENES.map((scene, i) => {
          const h = comicHighlights[i % comicHighlights.length]!;
          return { scene, caption: null, dialogue: [], characterRefs: [h.personRef], momentRefs: [h.ref] };
        }),
      }
    : null;

  return {
    article: {
      headline: `The week of ${input.weekLabel}`,
      bylineRef: (authors[0] ?? input.people[0]!).ref,
      body,
    },
    comic,
  };
}

export function fallbackHoroscope(sign: ZodiacSign): string {
  const name = sign.charAt(0).toUpperCase() + sign.slice(1);
  return `${name}, the stars are taking the week off. Make time for the people who make you laugh.`;
}
