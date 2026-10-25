import { z } from "zod";
import { cleanText, codePointLength, TEXT_LIMITS } from "@/lib/contract/text";
import { MOODS, SERIOUS_MOODS, type PanelSpec, type WrittenEvent } from "@/lib/ai/types";
import { findUngrounded } from "./grounding";
import { containsLink, containsMarkup } from "./redact";

// What the provider is asked to return. Sent as the JSON schema, and used as the first parse.
export const writerOutputSchema = z.strictObject({
  headline: z.string().max(TEXT_LIMITS.headline * 2),
  article: z.string().max(TEXT_LIMITS.article * 2),
  panel: z.strictObject({
    setting: z.string().max(160),
    action: z.string().max(240),
    mood: z.enum(MOODS),
    props: z.array(z.string().max(60)).max(3),
  }),
});

export const horoscopeOutputSchema = z.strictObject({ text: z.string().max(800) });

export const HOROSCOPE_MAX = 400;

export type RejectReason =
  | "not_json"
  | "schema"
  | "empty"
  | "too_long"
  | "link"
  | "markup"
  | "ungrounded"
  | "serious_mood"
  | "moderation";

export type Checked<T> = { ok: true; value: T } | { ok: false; reason: RejectReason };

function parseRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function plain(value: string, max: number, mode: "single-line" | "multiline"): Checked<string> {
  const v = cleanText(value, mode);
  if (!v) return { ok: false, reason: "empty" };
  if (codePointLength(v) > max) return { ok: false, reason: "too_long" };
  if (containsLink(v)) return { ok: false, reason: "link" };
  if (containsMarkup(v)) return { ok: false, reason: "markup" };
  return { ok: true, value: v };
}

export interface WriterCheckInput {
  /** The redacted text that was sent to the model. Grounding compares against this. */
  source: string;
  authorFirstName: string;
  serious: boolean;
}

/** Validates raw writer output. Nothing from the model is used unless this returns ok. */
export function checkWriterOutput(raw: unknown, input: WriterCheckInput): Checked<WrittenEvent> {
  const parsed = parseRaw(raw);
  if (parsed === undefined) return { ok: false, reason: "not_json" };
  const shape = writerOutputSchema.safeParse(parsed);
  if (!shape.success) return { ok: false, reason: "schema" };
  const o = shape.data;

  const headline = plain(o.headline, TEXT_LIMITS.headline, "single-line");
  if (!headline.ok) return headline;
  const article = plain(o.article, TEXT_LIMITS.article, "multiline");
  if (!article.ok) return article;
  const setting = plain(o.panel.setting, 80, "single-line");
  if (!setting.ok) return setting;
  const action = plain(o.panel.action, 120, "single-line");
  if (!action.ok) return action;
  const props: string[] = [];
  for (const p of o.panel.props) {
    const c = plain(p, 30, "single-line");
    if (!c.ok) return c;
    props.push(c.value);
  }

  if (input.serious && !SERIOUS_MOODS.includes(o.panel.mood)) return { ok: false, reason: "serious_mood" };

  const panel: PanelSpec = { setting: setting.value, action: action.value, mood: o.panel.mood, props };
  const allowed = [input.authorFirstName];
  for (const text of [headline.value, article.value, panel.setting, panel.action, ...panel.props]) {
    if (findUngrounded(text, input.source, allowed).length) return { ok: false, reason: "ungrounded" };
  }
  return { ok: true, value: { headline: headline.value, article: article.value, panel } };
}

export function checkHoroscopeOutput(raw: unknown): Checked<string> {
  const parsed = parseRaw(raw);
  if (parsed === undefined) return { ok: false, reason: "not_json" };
  const shape = horoscopeOutputSchema.safeParse(parsed);
  if (!shape.success) return { ok: false, reason: "schema" };
  return plain(shape.data.text, HOROSCOPE_MAX, "single-line");
}

/** Text used to moderate a panel before any image is generated. */
export function panelDescription(panel: PanelSpec): string {
  return [panel.setting, panel.action, ...panel.props].join(". ");
}
