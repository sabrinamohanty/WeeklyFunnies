import { z } from "zod";
import { STORY_SECTIONS, type StorySection } from "@/lib/contract/pages";
import { cleanText, codePointLength } from "@/lib/contract/text";
import { PAGE_AI_LIMITS as L } from "@/lib/ai/types";
import { findUngrounded } from "./grounding";
import type { PagePromptInput } from "./prompts";
import { containsLink, containsMarkup } from "./redact";

// What the provider is asked to return. Sent as the JSON schema, and used as the first parse.

const storyFields = {
  section: z.enum(STORY_SECTIONS),
  headline: z.string().max(L.headline * 2),
  body: z.string().max(L.body * 2),
};

const panelOutput = z.strictObject({
  scene: z.string().max(L.scene * 2),
  caption: z.string().max(240).nullable(),
  dialogue: z
    .array(z.strictObject({ text: z.string().max(200), side: z.enum(["left", "right"]) }))
    .max(L.dialoguePerPanel),
  moment: z.string().max(8),
});

export const pageOutputSchema = z.strictObject({
  stories: z
    .array(z.strictObject({ highlight: z.string().max(8), ...storyFields }))
    .min(1)
    .max(L.highlights),
  comic: z
    .strictObject({ title: z.string().max(L.title * 2), panels: z.array(panelOutput).length(L.panels) })
    .nullable(),
});

export const storyOutputSchema = z.strictObject(storyFields);

export const horoscopeOutputSchema = z.strictObject({ text: z.string().max(800) });

export const HOROSCOPE_MAX = 400;

export type RejectReason =
  | "not_json"
  | "schema"
  | "empty"
  | "too_long"
  | "too_many_words"
  | "link"
  | "markup"
  | "ungrounded"
  | "references"
  | "tone"
  | "scene_text"
  | "moderation";

export type Checked<T> = { ok: true; value: T } | { ok: false; reason: RejectReason };

/** A validated story that still uses the prompt's refs (h1) instead of real ids. */
export interface RefStory {
  highlightRef: string;
  section: StorySection;
  headline: string;
  body: string;
}

/** A validated page that still uses the prompt's refs. */
export interface RefPage {
  stories: RefStory[];
  comic: {
    title: string;
    panels: Array<{
      scene: string;
      caption: string | null;
      dialogue: Array<{ text: string; side: "left" | "right" }>;
      momentRef: string;
    }>;
  } | null;
}

const FENCE = /^\s*```[a-z]*\s*([\s\S]*?)\s*```\s*$/i;

function parseRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw.replace(FENCE, "$1"));
  } catch {
    return undefined;
  }
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

class Reject extends Error {
  constructor(readonly reason: RejectReason) {
    super(reason);
  }
}

function plain(value: string, max: number, mode: "single-line" | "multiline" = "single-line"): string {
  const v = cleanText(value, mode);
  if (!v) throw new Reject("empty");
  if (codePointLength(v) > max) throw new Reject("too_long");
  if (containsLink(v)) throw new Reject("link");
  if (containsMarkup(v)) throw new Reject("markup");
  return v;
}

function grounded(text: string, source: string, names: string[], opts?: { ignoreSentenceStart?: boolean }) {
  if (findUngrounded(text, source, names, opts).length) throw new Reject("ungrounded");
}

/** Exactly what the model saw: redacted texts, prompt-safe name and city. Grounding compares against it. */
export type PageCheckInput = PagePromptInput;

const comicEligible = (input: PageCheckInput) => input.highlights.filter((h) => h.inComic && !h.serious);

function checkStoryFields(
  o: { section: StorySection; headline: string; body: string },
  input: PageCheckInput,
  ref: string,
): RefStory {
  const names = [input.name];
  const source = [input.weekLabel, input.city ?? "", ...input.highlights.map((h) => h.text)].join("\n");
  const headline = plain(o.headline, L.headline);
  const body = plain(o.body, L.body);
  grounded(headline, source, names);
  grounded(body, source, names);
  if (input.highlights.find((h) => h.ref === ref)?.serious && /[!！]/.test(headline + body)) {
    throw new Reject("tone");
  }
  return { highlightRef: ref, section: o.section, headline, body };
}

/** Validates raw page output. Nothing from the model is used unless this returns ok. */
export function checkPageOutput(raw: unknown, input: PageCheckInput): Checked<RefPage> {
  const parsed = parseRaw(raw);
  if (parsed === undefined) return { ok: false, reason: "not_json" };
  const shape = pageOutputSchema.safeParse(parsed);
  if (!shape.success) return { ok: false, reason: "schema" };
  const o = shape.data;

  const refs = input.highlights.map((h) => h.ref);
  const eligible = comicEligible(input);
  const names = [input.name];
  const comicSource = [input.city ?? "", ...eligible.map((h) => h.text)].join("\n");

  try {
    if (o.stories.length !== refs.length || o.stories.some((st, i) => st.highlight !== refs[i])) {
      throw new Reject("references");
    }
    const stories = o.stories.map((st) => checkStoryFields(st, input, st.highlight));

    let comic: RefPage["comic"] = null;
    if ((o.comic === null) !== (eligible.length === 0)) throw new Reject("references");
    if (o.comic) {
      const title = plain(o.comic.title, L.title);
      grounded(title, comicSource, names);
      const eligibleRefs = new Set(eligible.map((h) => h.ref));
      const panels = o.comic.panels.map((p) => {
        if (!eligibleRefs.has(p.moment)) throw new Reject("references");
        const scene = plain(p.scene, L.scene);
        if (/["“”«»„]/.test(scene)) throw new Reject("scene_text");
        grounded(scene, comicSource, names);

        let caption: string | null = null;
        if (p.caption !== null) {
          caption = plain(p.caption, 120);
          if (wordCount(caption) > L.captionWords) throw new Reject("too_many_words");
          grounded(caption, comicSource, names);
        }
        const dialogue = p.dialogue.map((d) => {
          const text = plain(d.text, 100);
          if (wordCount(text) > L.dialogueWords) throw new Reject("too_many_words");
          // Dialogue is invented speech by nature, so only names and numbers are checked.
          grounded(text, comicSource, names, { ignoreSentenceStart: true });
          return { text, side: d.side };
        });
        return { scene, caption, dialogue, momentRef: p.moment };
      });
      comic = { title, panels };
    }
    return { ok: true, value: { stories, comic } };
  } catch (err) {
    if (err instanceof Reject) return { ok: false, reason: err.reason };
    throw err;
  }
}

/** Validates a single rewritten story for the one highlight in `input`. */
export function checkStoryOutput(raw: unknown, input: PageCheckInput): Checked<RefStory> {
  const parsed = parseRaw(raw);
  if (parsed === undefined) return { ok: false, reason: "not_json" };
  const shape = storyOutputSchema.safeParse(parsed);
  if (!shape.success) return { ok: false, reason: "schema" };
  try {
    return { ok: true, value: checkStoryFields(shape.data, input, input.highlights[0]!.ref) };
  } catch (err) {
    if (err instanceof Reject) return { ok: false, reason: err.reason };
    throw err;
  }
}

export function checkHoroscopeOutput(raw: unknown): Checked<string> {
  const parsed = parseRaw(raw);
  if (parsed === undefined) return { ok: false, reason: "not_json" };
  const shape = horoscopeOutputSchema.safeParse(parsed);
  if (!shape.success) return { ok: false, reason: "schema" };
  try {
    return { ok: true, value: plain(shape.data.text, HOROSCOPE_MAX) };
  } catch (err) {
    if (err instanceof Reject) return { ok: false, reason: err.reason };
    throw err;
  }
}

/** All generated page text in one block, for output moderation. */
export function pageText(p: RefPage): string {
  const parts = p.stories.flatMap((st) => [st.headline, st.body]);
  if (p.comic) {
    parts.push(p.comic.title);
    for (const panel of p.comic.panels) {
      parts.push(panel.scene, panel.caption ?? "", ...panel.dialogue.map((d) => d.text));
    }
  }
  return parts.filter(Boolean).join("\n");
}
