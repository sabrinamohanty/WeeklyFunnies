import { createHash } from "node:crypto";
import type { AiProvider, CallContext, ImageTask, JsonTask } from "../../types";
import { unwrapUntrusted } from "@/lib/safety/delimit";
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
  name: string;
  highlights: Array<{ ref: string; comic: boolean; serious: boolean; text: string }>;
  previous?: string;
}

function parse(user: string): Parsed {
  const highlights = [
    ...user.matchAll(
      /\[(h\d+)\] comic: (yes|no) \| tone: (serious|light)\n<<<HIGHLIGHT id=(\w+)>>>\n([\s\S]*?)\n<<<END HIGHLIGHT id=\4>>>/g,
    ),
  ].map((m) => ({ ref: m[1]!, comic: m[2] === "yes", serious: m[3] === "serious", text: m[5]! }));
  return {
    week: /^Week of (.*)$/m.exec(user)?.[1] ?? "",
    name: unwrapUntrusted(user, "name") ?? "Friend",
    highlights,
    previous: unwrapUntrusted(user, "previous"),
  };
}

/** Writes like an ideal model: only the person's own words, plain text, valid shape and references. */
function writeStory(name: string, h: Parsed["highlights"][number], again = false) {
  const said = words(h.text);
  const lead = again ? `${name} returns:` : `${name}:`;
  return {
    section: "news" as const,
    headline: said.length ? fit([lead, ...said.slice(0, 8)], 120) : `${name} had a week`,
    body: said.length
      ? `${name} shared this from the week: ${fit(said, 200)}.`
      : `${name} shared some news this week.`,
  };
}

function writePage(user: string) {
  const { name, highlights } = parse(user);
  const comicHighlights = highlights.filter((h) => h.comic && !h.serious);
  return {
    stories: highlights.map((h) => ({ highlight: h.ref, ...writeStory(name, h) })),
    comic: comicHighlights.length
      ? {
          title: "Meanwhile, this week",
          panels: SCENES.map((scene, i) => {
            const h = comicHighlights[i % comicHighlights.length]!;
            const caption = fit(words(h.text).slice(0, 12), 110);
            return {
              scene,
              caption: caption || null,
              dialogue: [{ text: "What a week!", side: i % 2 ? "right" : "left" }],
              moment: h.ref,
            };
          }),
        }
      : null,
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

    if (req.task === "story") {
      const parsed = parse(req.user);
      const story = writeStory(parsed.name, parsed.highlights[0]!, Boolean(parsed.previous));
      switch (fault) {
        case "fenced":
          return { raw: "```json\n" + JSON.stringify(story) + "\n```", meta };
        case "extra_fields":
          return { raw: { ...story, approved: true }, meta };
        case "link":
          return { raw: { ...story, body: `${story.body} More at https://evil.example/x` }, meta };
        case "markup":
          return { raw: { ...story, headline: `<b>${story.headline}</b>` }, meta };
        case "ungrounded":
          return { raw: { ...story, body: `${story.body} Later, Beyoncé joined them in Paris.` }, meta };
        case "too_long":
          return { raw: { ...story, headline: "word ".repeat(60) }, meta };
        default:
          return { raw: JSON.stringify(story), meta };
      }
    }

    const out = writePage(req.user);
    const [first, ...rest] = out.stories;
    const withFirst = (patch: Partial<NonNullable<typeof first>>) => ({
      ...out,
      stories: [{ ...first!, ...patch }, ...rest],
    });
    const panels = out.comic?.panels ?? [];
    switch (fault) {
      case "fenced":
        return { raw: "```json\n" + JSON.stringify(out) + "\n```", meta };
      case "extra_fields":
        return { raw: { ...out, approved: true }, meta };
      case "link":
        return { raw: withFirst({ body: `${first!.body} More at https://evil.example/x` }), meta };
      case "markup":
        return { raw: withFirst({ headline: `<b>${first!.headline}</b>` }), meta };
      case "ungrounded":
        return { raw: withFirst({ body: `${first!.body} Later, Beyoncé joined them in Paris.` }), meta };
      case "too_long":
        return { raw: withFirst({ headline: "word ".repeat(60) }), meta };
      case "bad_refs":
        return {
          raw: {
            ...out,
            comic: out.comic && { ...out.comic, panels: panels.map((p) => ({ ...p, moment: "h99" })) },
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
