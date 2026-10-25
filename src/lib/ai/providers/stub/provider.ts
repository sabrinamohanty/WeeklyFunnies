import { createHash } from "node:crypto";
import type { AiProvider, CallContext, ImageTask, JsonTask } from "../../types";
import { solidPng } from "./png";

/** Ways the stub can misbehave, so tests can drive every failure path without a vendor. */
export type StubFault =
  | "error"
  | "timeout"
  | "not_json"
  | "fenced"
  | "extra_fields"
  | "link"
  | "markup"
  | "ungrounded"
  | "too_long"
  | "bad_refs"
  | "scene_text"
  | "bad_image";

export type FaultPlan =
  StubFault | undefined | ((task: JsonTask | ImageTask, call: number) => StubFault | undefined);

const hash = (s: string) => createHash("sha256").update(s).digest();

const SCENES = [
  "a sunny park, the character beaming with pride, wide shot",
  "a cozy kitchen, the character laughing, medium shot",
  "a busy street, the character cheering, low angle",
  "a bright living room, the character relaxing, close-up",
];

function words(text: string): string[] {
  return text.match(/[\p{L}\p{M}\p{N}'’]+/gu)?.filter((w) => !["link", "email", "phone"].includes(w)) ?? [];
}

function fit(parts: string[], max: number): string {
  let out = "";
  for (const p of parts) {
    const next = out ? `${out} ${p}` : p;
    if (Array.from(next).length > max) break;
    out = next;
  }
  return out;
}

interface Parsed {
  week: string;
  people: Array<{ ref: string; name: string }>;
  highlights: Array<{ ref: string; personRef: string; comic: boolean; serious: boolean; text: string }>;
}

function parse(user: string): Parsed {
  const people = [
    ...user.matchAll(/- id: (p\d+) \| name:\n<<<NAME id=(\w+)>>>\n([\s\S]*?)\n<<<END NAME id=\2>>>/g),
  ].map((m) => ({ ref: m[1]!, name: m[3]! }));
  const highlights = [
    ...user.matchAll(
      /\[(h\d+)\] person: (p\d+) \| comic: (yes|no) \| tone: (serious|light)\n<<<HIGHLIGHT id=(\w+)>>>\n([\s\S]*?)\n<<<END HIGHLIGHT id=\5>>>/g,
    ),
  ].map((m) => ({
    ref: m[1]!,
    personRef: m[2]!,
    comic: m[3] === "yes",
    serious: m[4] === "serious",
    text: m[6]!,
  }));
  return { week: /^Week of (.*)$/m.exec(user)?.[1] ?? "", people, highlights };
}

/** Writes like an ideal model: only the people's own words, plain text, valid shape and references. */
function writeStory(user: string) {
  const { week, people, highlights } = parse(user);
  const name = (ref: string) => people.find((p) => p.ref === ref)?.name ?? "Friend";
  const authors = people.filter((p) => highlights.some((h) => h.personRef === p.ref));

  const lead = highlights.find((h) => !h.serious) ?? highlights[0]!;
  const leadWords = words(lead.text);
  const headline = leadWords.length
    ? fit([`${name(lead.personRef)}:`, ...leadWords.slice(0, 8)], 120)
    : `${name(lead.personRef)} had a week`;

  // At most 5 paragraphs: one per author, with any authors past the fourth sharing the fifth.
  const groups =
    authors.length <= 5
      ? authors.map((a) => [a])
      : [...authors.slice(0, 4).map((a) => [a]), authors.slice(4)];
  const paragraphs = groups.map((group) => {
    const mine = highlights.filter((h) => group.some((p) => p.ref === h.personRef));
    const who = group.map((p) => p.name).join(" and ");
    const said = fit(
      mine.flatMap((h) => words(h.text)),
      200,
    );
    const open = mine.some((h) => h.serious)
      ? `${who} shared something from the week.`
      : `${who} had a week worth sharing.`;
    return said ? `${open} In their words: ${said}.` : open;
  });
  const padding = [`The week of ${week} is in the books.`, "It was quite a week for the group."];
  while (paragraphs.length < 3) paragraphs.push(padding[paragraphs.length - 1] ?? padding[1]!);

  const comicHighlights = highlights.filter((h) => h.comic && !h.serious);
  const comic = comicHighlights.length
    ? {
        title: "Meanwhile, this week",
        panels: SCENES.map((scene, i) => {
          const h = comicHighlights[i % comicHighlights.length]!;
          const caption = fit(words(h.text).slice(0, 12), 110);
          return {
            scene,
            caption: caption || null,
            dialogue: [{ speaker: name(h.personRef), text: "What a week!", side: i % 2 ? "right" : "left" }],
            characters: [h.personRef],
            moments: [h.ref],
          };
        }),
      }
    : null;

  return {
    article: { headline, byline: authors[0]?.name ?? people[0]!.name, body: paragraphs.join("\n\n") },
    comic,
  };
}

function abortable(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/** Deterministic provider for development and tests. Same input, same output. No network calls. */
export class StubProvider implements AiProvider {
  readonly id = "stub";
  readonly calls: Array<{ task: JsonTask | ImageTask }> = [];

  constructor(private readonly faults: FaultPlan = undefined) {}

  private fault(task: JsonTask | ImageTask): StubFault | undefined {
    const n = this.calls.filter((c) => c.task === task).length;
    this.calls.push({ task });
    return typeof this.faults === "function" ? this.faults(task, n) : this.faults;
  }

  async completeJson(req: Parameters<AiProvider["completeJson"]>[0], ctx: CallContext) {
    const fault = this.fault(req.task);
    const meta = { provider: this.id, model: "stub-text-1", latencyMs: 0, inputTokens: 0, outputTokens: 0 };
    if (fault === "error") throw new Error("stub provider error");
    if (fault === "timeout") return abortable(ctx.signal);
    if (fault === "not_json") return { raw: "Sure! Here is your story: ...", meta };

    if (req.task === "horoscope") {
      const sign = /Sign: (\w+)/.exec(req.user)?.[1] ?? "friend";
      const base = { text: `A bright week ahead for ${sign}. Say yes to a small adventure with friends.` };
      if (fault === "link") return { raw: { text: "Read more at https://example.com" }, meta };
      if (fault === "extra_fields") return { raw: { ...base, lucky: 7 }, meta };
      return { raw: base, meta };
    }

    const out = writeStory(req.user);
    const panels = out.comic?.panels ?? [];
    switch (fault) {
      case "fenced":
        return { raw: "```json\n" + JSON.stringify(out) + "\n```", meta };
      case "extra_fields":
        return { raw: { ...out, approved: true }, meta };
      case "link":
        return {
          raw: {
            ...out,
            article: { ...out.article, body: `${out.article.body} More at https://evil.example/x` },
          },
          meta,
        };
      case "markup":
        return {
          raw: { ...out, article: { ...out.article, headline: `<b>${out.article.headline}</b>` } },
          meta,
        };
      case "ungrounded":
        return {
          raw: {
            ...out,
            article: { ...out.article, body: `${out.article.body} Later, Beyoncé joined them in Paris.` },
          },
          meta,
        };
      case "too_long":
        return { raw: { ...out, article: { ...out.article, headline: "word ".repeat(60) } }, meta };
      case "bad_refs":
        return {
          raw: {
            ...out,
            comic: out.comic && { ...out.comic, panels: panels.map((p) => ({ ...p, characters: ["p99"] })) },
          },
          meta,
        };
      case "scene_text":
        return {
          raw: {
            ...out,
            comic: out.comic && {
              ...out.comic,
              panels: panels.map((p) => ({ ...p, scene: 'a banner reading "WIN"' })),
            },
          },
          meta,
        };
      default:
        return { raw: JSON.stringify(out), meta };
    }
  }

  async generateImage(req: Parameters<AiProvider["generateImage"]>[0], ctx: CallContext) {
    const fault = this.fault(req.task);
    const meta = { provider: this.id, model: "stub-image-1", latencyMs: 0 };
    if (fault === "error") throw new Error("stub provider error");
    if (fault === "timeout") return abortable(ctx.signal);
    if (fault === "bad_image") {
      return {
        image: { bytes: new TextEncoder().encode("<svg onload=alert(1)>"), mimeType: "image/png" as const },
        meta,
      };
    }
    const seed = hash(
      `${req.task}|${req.style.key}|${req.aspectRatio}|${req.prompt}|${req.references.length}|${req.seed ?? 0}`,
    );
    return {
      image: { bytes: solidPng([seed[0]!, seed[1]!, seed[2]!]), mimeType: "image/png" as const },
      meta,
    };
  }
}
