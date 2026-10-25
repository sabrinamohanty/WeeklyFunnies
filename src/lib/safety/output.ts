import { z } from "zod";
import { cleanText, codePointLength } from "@/lib/contract/text";
import { STORY_LIMITS as L } from "@/lib/ai/types";
import { findUngrounded } from "./grounding";
import type { StoryPromptHighlight, StoryPromptPerson } from "./prompts";
import { containsLink, containsMarkup } from "./redact";

// What the provider is asked to return. Sent as the JSON schema, and used as the first parse.
// Matches the pipeline handoff, plus "moments" so each panel can carry the photos of what it shows.
const dialogueOutput = z.strictObject({
  speaker: z.string().max(80),
  text: z.string().max(200),
  side: z.enum(["left", "right"]),
});

const panelOutput = z.strictObject({
  scene: z.string().max(L.scene * 2),
  caption: z.string().max(240).nullable(),
  dialogue: z.array(dialogueOutput).max(L.dialoguePerPanel),
  characters: z.array(z.string().max(8)).min(1).max(L.charactersPerPanel),
  moments: z.array(z.string().max(8)).min(1).max(2),
});

export const storyOutputSchema = z.strictObject({
  article: z.strictObject({
    headline: z.string().max(L.headline * 2),
    byline: z.string().max(80),
    body: z.string().max(L.body * 2),
  }),
  comic: z
    .strictObject({ title: z.string().max(L.title * 2), panels: z.array(panelOutput).length(L.panels) })
    .nullable(),
});

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
  | "byline"
  | "paragraphs"
  | "references"
  | "scene_text"
  | "moderation";

export type Checked<T> = { ok: true; value: T } | { ok: false; reason: RejectReason };

/** A validated story that still uses the prompt's refs (p1, h1) instead of real ids. */
export interface RefStory {
  article: { headline: string; bylineRef: string; body: string };
  comic: {
    title: string;
    panels: Array<{
      scene: string;
      caption: string | null;
      dialogue: Array<{ speakerRef: string; text: string; side: "left" | "right" }>;
      characterRefs: string[];
      momentRefs: string[];
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

export interface StoryCheckInput {
  weekLabel: string;
  people: StoryPromptPerson[];
  /** Redacted texts, exactly as sent to the model. Grounding compares against these. */
  highlights: StoryPromptHighlight[];
}

/** Validates raw story output. Nothing from the model is used unless this returns ok. */
export function checkStoryOutput(raw: unknown, input: StoryCheckInput): Checked<RefStory> {
  const parsed = parseRaw(raw);
  if (parsed === undefined) return { ok: false, reason: "not_json" };
  const shape = storyOutputSchema.safeParse(parsed);
  if (!shape.success) return { ok: false, reason: "schema" };
  const o = shape.data;

  const names = input.people.map((p) => p.name);
  const refByName = new Map(input.people.map((p) => [p.name, p.ref]));
  const comicHighlights = input.highlights.filter((h) => h.inComic && !h.serious);
  const articleSource = [input.weekLabel, ...input.highlights.map((h) => h.text)].join("\n");
  const comicSource = comicHighlights.map((h) => h.text).join("\n");

  try {
    const headline = plain(o.article.headline, L.headline);
    const bylineRef = refByName.get(cleanText(o.article.byline, "single-line"));
    if (!bylineRef) throw new Reject("byline");
    const body = plain(o.article.body, L.body, "multiline");
    const paragraphs = body.split(/\n\n/);
    if (paragraphs.length < L.paragraphsMin || paragraphs.length > L.paragraphsMax)
      throw new Reject("paragraphs");
    for (const t of [headline, ...paragraphs]) grounded(t, articleSource, names);

    let comic: RefStory["comic"] = null;
    if ((o.comic === null) !== (comicHighlights.length === 0)) throw new Reject("references");
    if (o.comic) {
      const title = plain(o.comic.title, L.title);
      grounded(title, comicSource, names);
      const personRefs = new Set(input.people.map((p) => p.ref));
      const momentAuthor = new Map(comicHighlights.map((h) => [h.ref, h.personRef]));
      const panels = o.comic.panels.map((p) => {
        const characterRefs = [...new Set(p.characters)];
        const momentRefs = [...new Set(p.moments)];
        if (characterRefs.length !== p.characters.length || momentRefs.length !== p.moments.length) {
          throw new Reject("references");
        }
        if (!characterRefs.every((r) => personRefs.has(r))) throw new Reject("references");
        if (!momentRefs.every((r) => characterRefs.includes(momentAuthor.get(r) ?? ""))) {
          throw new Reject("references");
        }

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
          const speakerRef = refByName.get(cleanText(d.speaker, "single-line"));
          if (!speakerRef || !characterRefs.includes(speakerRef)) throw new Reject("references");
          const text = plain(d.text, 100);
          if (wordCount(text) > L.dialogueWords) throw new Reject("too_many_words");
          // Dialogue is invented speech by nature, so only names and numbers are checked.
          grounded(text, comicSource, names, { ignoreSentenceStart: true });
          return { speakerRef, text, side: d.side };
        });
        return { scene, caption, dialogue, characterRefs, momentRefs };
      });
      comic = { title, panels };
    }
    return { ok: true, value: { article: { headline, bylineRef, body }, comic } };
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

/** All generated story text in one block, for output moderation. */
export function storyText(s: RefStory): string {
  const parts = [s.article.headline, s.article.body];
  if (s.comic) {
    parts.push(s.comic.title);
    for (const p of s.comic.panels) parts.push(p.scene, p.caption ?? "", ...p.dialogue.map((d) => d.text));
  }
  return parts.filter(Boolean).join("\n");
}
