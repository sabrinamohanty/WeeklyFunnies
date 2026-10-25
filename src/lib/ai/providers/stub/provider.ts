import { createHash } from "node:crypto";
import { unwrapUntrusted } from "@/lib/safety/delimit";
import {
  SERIOUS_MOODS,
  MOODS,
  type AiProvider,
  type CallContext,
  type ImageTask,
  type JsonTask,
} from "../../types";
import { solidPng } from "./png";

/** Ways the stub can misbehave, so tests can drive every failure path without a vendor. */
export type StubFault =
  | "error"
  | "timeout"
  | "not_json"
  | "extra_fields"
  | "link"
  | "markup"
  | "ungrounded"
  | "too_long"
  | "bad_image";

export type FaultPlan =
  StubFault | undefined | ((task: JsonTask | ImageTask, call: number) => StubFault | undefined);

function hash(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function pick<T>(items: readonly T[], seed: Buffer, i: number): T {
  return items[seed[i % seed.length]! % items.length]!;
}

const SETTINGS = ["a sunny park", "a cozy kitchen", "a busy street", "a bright living room", "a quiet cafe"];
const ACTIONS = ["smiling at the moment", "cheering happily", "laughing with delight", "taking it all in"];
const SERIOUS_SETTINGS = ["a quiet room with soft light", "a calm garden"];
const SERIOUS_ACTIONS = ["sitting quietly", "looking out of a window"];

function words(text: string): string[] {
  return (
    text.match(/[\p{L}\p{M}\p{N}'’]+/gu)?.filter((w) => w !== "link" && w !== "email" && w !== "phone") ?? []
  );
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

/** Writes like an ideal model: only the person's own words, plain text, valid shape. */
function writeEvent(user: string, seed: Buffer) {
  const name = words(unwrapUntrusted(user, "author_name") ?? "")[0] ?? "Friend";
  const text = unwrapUntrusted(user, "highlight") ?? "";
  const serious = user.startsWith("Tone: serious");
  const w = words(text);
  const headline = w.length ? fit([`${name}:`, ...w.slice(0, 8)], 120) : `${name}'s week`;
  const body = fit(w, 520);
  const article = serious
    ? `${name} shared something from the week.${body ? ` In their words: ${body}.` : ""}`
    : `${name} had a week worth sharing.${body ? ` In their words: ${body}.` : ""}`;
  return {
    headline,
    article,
    panel: {
      setting: pick(serious ? SERIOUS_SETTINGS : SETTINGS, seed, 0),
      action: pick(serious ? SERIOUS_ACTIONS : ACTIONS, seed, 1),
      mood: pick(serious ? SERIOUS_MOODS : MOODS.filter((m) => !SERIOUS_MOODS.includes(m)), seed, 2),
      props: [],
    },
  };
}

function abortable(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/**
 * Deterministic provider for development and tests. Same input, same output. No network calls.
 */
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
    if (fault === "not_json") return { raw: "Sure! Here is your article: ...", meta };

    const seed = hash(req.user);
    if (req.task === "horoscope") {
      const sign = /Sign: (\w+)/.exec(req.user)?.[1] ?? "friend";
      const base = { text: `A bright week ahead for ${sign}. Say yes to a small adventure with friends.` };
      if (fault === "link") return { raw: { text: "Read more at https://example.com" }, meta };
      if (fault === "extra_fields") return { raw: { ...base, lucky: 7 }, meta };
      return { raw: base, meta };
    }

    const out = writeEvent(req.user, seed);
    switch (fault) {
      case "extra_fields":
        return { raw: { ...out, approved: true }, meta };
      case "link":
        return { raw: { ...out, article: `${out.article} More at https://evil.example/x` }, meta };
      case "markup":
        return { raw: { ...out, headline: `<b>${out.headline}</b>` }, meta };
      case "ungrounded":
        return { raw: { ...out, article: `${out.article} Later, Beyoncé joined them in Paris.` }, meta };
      case "too_long":
        return { raw: { ...out, headline: "word ".repeat(60) }, meta };
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
    const seed = hash(`${req.task}|${req.style.styleId}|${req.prompt}|${req.seed ?? 0}`);
    return {
      image: { bytes: solidPng([seed[0]!, seed[1]!, seed[2]!]), mimeType: "image/png" as const },
      meta,
    };
  }
}
