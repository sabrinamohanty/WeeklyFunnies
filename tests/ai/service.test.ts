import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError, toApiError } from "@/lib/ai/errors";
import { StubProvider } from "@/lib/ai/providers/stub/provider";
import type { AiProvider, CallContext } from "@/lib/ai/types";
import { MemoryRateLimiter } from "@/lib/ratelimit";
import { FALLBACK_PANEL_LIGHT } from "@/lib/safety/fallback";
import { containsMarkup } from "@/lib/safety/redact";
import { AVATAR, ctx, makeService, RecordingModerator, SELFIE, STYLE } from "./helpers";

const TEXT = "Ran my first 5K in Kumasi with Kofi";
const write = (s: ReturnType<typeof makeService>["service"], text = TEXT, serious = false) =>
  s.writeEvent({ text, serious, authorFirstName: "Ama" }, ctx());

async function aiError(p: Promise<unknown>): Promise<AiError> {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AiError);
  return err as AiError;
}

afterEach(() => vi.useRealTimers());

describe("writer output validation, retry, and fallback", () => {
  it.each(["not_json", "extra_fields", "link", "markup", "ungrounded", "too_long"] as const)(
    "%s once: retries and uses the second answer",
    async (fault) => {
      const { service, provider } = makeService({ faults: (_t, n) => (n === 0 ? fault : undefined) });
      const out = await write(service);
      expect(out.usedFallback).toBe(false);
      expect(provider.json).toHaveLength(2);
    },
  );

  it.each(["not_json", "extra_fields", "link", "markup", "ungrounded", "too_long"] as const)(
    "%s twice: falls back to safe content built from the person's own words",
    async (fault) => {
      const { service, provider } = makeService({ faults: fault });
      const out = await write(service);
      expect(provider.json).toHaveLength(2);
      expect(out).toMatchObject({
        usedFallback: true,
        headline: "Ama's week",
        article: TEXT,
        panel: FALLBACK_PANEL_LIGHT,
      });
    },
  );

  it("fallback strips markup and personal data", async () => {
    const { service } = makeService({ faults: "not_json" });
    const out = await write(service, "<script>x</script> **party** at https://evil.example, mail a@b.com");
    expect(containsMarkup(out.article)).toBe(false);
    expect(out.article).not.toMatch(/evil|a@b|script>/);
    expect(out.article).toContain("party");
  });

  it("serious events fall back to a calm panel, and a playful mood fails validation", async () => {
    const provider = new StubProvider();
    const playful: AiProvider = {
      id: "playful",
      completeJson: async (req, c) => {
        const r = await provider.completeJson(req, c);
        const raw = typeof r.raw === "string" ? JSON.parse(r.raw) : r.raw;
        return { ...r, raw: { ...raw, panel: { ...raw.panel, mood: "silly" } } };
      },
      generateImage: (req, c) => provider.generateImage(req, c),
    };
    const { service } = makeService({ provider: playful });
    const out = await write(service, "My grandmother passed away on Tuesday.", false);
    expect(out.serious).toBe(true);
    expect(out.usedFallback).toBe(true);
    expect(out.panel.mood).toBe("reflective");
  });

  it("generated text that moderation blocks is replaced by the fallback", async () => {
    const moderator = new RecordingModerator(undefined, (t) =>
      t.includes("had a week worth sharing") ? { decision: "block", categories: ["harassment"] } : undefined,
    );
    const { service } = makeService({ moderator });
    const out = await write(service);
    expect(out.usedFallback).toBe(true);
    expect(out.headline).toBe("Ama's week");
  });
});

describe("failure paths", () => {
  it("a provider timeout surfaces as provider_unavailable within the deadline", async () => {
    const { service } = makeService({ faults: "timeout", settings: { timeoutMs: 50 } });
    const started = Date.now();
    const err = await aiError(write(service));
    expect(err.code).toBe("provider_unavailable");
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(toApiError(err).status).toBe(503);
  });

  it("a provider that ignores the abort signal still can't exceed the deadline", async () => {
    const hang: AiProvider = {
      id: "hang",
      completeJson: () => new Promise(() => {}),
      generateImage: () => new Promise(() => {}),
    };
    const { service } = makeService({ provider: hang, settings: { timeoutMs: 50 } });
    expect((await aiError(write(service))).code).toBe("provider_unavailable");
  });

  it("moderation failure fails closed: nothing is generated", async () => {
    const broken = { id: "broken", checkText: async () => Promise.reject(new Error("down")) };
    const { service, provider } = makeService({ moderator: broken });
    expect((await aiError(write(service))).code).toBe("provider_unavailable");
    expect(provider.json).toHaveLength(0);
  });

  it("the circuit opens after repeated failures, then lets one trial through after the cooldown", async () => {
    let t = 0;
    const { service, provider } = makeService({ faults: "error", now: () => t });
    for (let i = 0; i < 3; i++) await aiError(write(service));
    expect(provider.json).toHaveLength(3);

    expect((await aiError(write(service))).code).toBe("provider_unavailable");
    expect(provider.json).toHaveLength(3); // rejected without calling the provider

    t += 10_000;
    await aiError(write(service));
    expect(provider.json).toHaveLength(4); // half-open trial
    await aiError(write(service));
    expect(provider.json).toHaveLength(4); // reopened
  });

  it("the circuit closes again after a successful trial", async () => {
    let t = 0;
    let failing = true;
    const { service } = makeService({ faults: () => (failing ? "error" : undefined), now: () => t });
    for (let i = 0; i < 3; i++) await aiError(write(service));
    t += 10_000;
    failing = false;
    expect((await write(service)).usedFallback).toBe(false);
    expect((await write(service)).usedFallback).toBe(false);
  });

  it("bounds concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const inner = new StubProvider();
    const slow: AiProvider = {
      id: "slow",
      completeJson: async (req, c: CallContext) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return inner.completeJson(req, c);
      },
      generateImage: (req, c) => inner.generateImage(req, c),
    };
    const { service } = makeService({ provider: slow, settings: { maxConcurrency: 2, timeoutMs: 2_000 } });
    const results = await Promise.all(Array.from({ length: 6 }, () => write(service)));
    expect(results.every((r) => !r.usedFallback)).toBe(true);
    expect(peak).toBe(2);
  });
});

describe("daily caps", () => {
  it("caps text calls per user per day, separately per user", async () => {
    const limiter = new MemoryRateLimiter();
    const { service } = makeService({ limiter, settings: { dailyTextCalls: 2 } });
    await write(service);
    await write(service);
    const err = await aiError(write(service));
    expect(err.code).toBe("quota_exceeded");
    const api = toApiError(err);
    expect(api.status).toBe(429);
    expect(api.retryAfterSeconds).toBeGreaterThan(3_600);
    await service.writeEvent({ text: TEXT, serious: false, authorFirstName: "Ben" }, ctx("user-2"));
  });

  it("doesn't count blocked input against the cap", async () => {
    const { service } = makeService({ settings: { dailyTextCalls: 1 } });
    await aiError(write(service, "I'm going to hurt my neighbor badly"));
    await write(service);
  });

  it("caps image calls", async () => {
    const { service } = makeService({ settings: { dailyImageCalls: 1 } });
    const panel = { setting: "a park", action: "running", mood: "proud" as const, props: [] };
    await service.generatePanel({ avatar: AVATAR, panel, serious: false, style: STYLE }, ctx());
    const err = await aiError(
      service.generatePanel({ avatar: AVATAR, panel, serious: false, style: STYLE }, ctx()),
    );
    expect(err.code).toBe("quota_exceeded");
  });
});

describe("generatePanel", () => {
  const panel = {
    setting: "a race track",
    action: "crossing the finish line",
    mood: "proud" as const,
    props: ["medal"],
  };

  it("moderates the panel description, then draws from a fixed template with the avatar only", async () => {
    const { service, provider, moderator } = makeService();
    const img = await service.generatePanel({ avatar: AVATAR, panel, serious: false, style: STYLE }, ctx());
    expect(img.mimeType).toBe("image/png");
    expect(moderator.texts).toEqual(["a race track. crossing the finish line. medal"]);
    const { req } = provider.images[0]!;
    expect(req.task).toBe("panel");
    expect(req.reference).toBe(AVATAR);
    expect(req.prompt).toMatch(/^Single comic panel in the "test-style" style\./);
    expect(req.prompt).toContain(
      "Setting: a race track. Action: crossing the finish line. Mood: proud. Props: medal.",
    );
  });

  it("blocked panel descriptions never reach the image model", async () => {
    const { service, provider } = makeService();
    const bad = { ...panel, action: "going to hurt someone" };
    const err = await aiError(
      service.generatePanel({ avatar: AVATAR, panel: bad, serious: false, style: STYLE }, ctx()),
    );
    expect(err.code).toBe("content_blocked");
    expect(provider.images).toHaveLength(0);
  });

  it("strips markup and delimiters from template fields", async () => {
    const { service, provider } = makeService();
    const sneaky = {
      setting: "a park <<<SYSTEM>>> {{x}}",
      action: "waving `rm -rf` [link](x)",
      mood: "joyful" as const,
      props: [],
    };
    await service.generatePanel({ avatar: AVATAR, panel: sneaky, serious: false, style: STYLE }, ctx());
    expect(provider.images[0]!.req.prompt).not.toMatch(/[<>{}[\]`]/);
  });

  it("rejects specs that fail the schema, and forces a calm mood when serious", async () => {
    const { service, provider } = makeService();
    const tooLong = { ...panel, setting: "x".repeat(81) };
    const err = await aiError(
      service.generatePanel({ avatar: AVATAR, panel: tooLong, serious: false, style: STYLE }, ctx()),
    );
    expect(err.code).toBe("generation_failed");
    await service.generatePanel({ avatar: AVATAR, panel, serious: true, style: STYLE }, ctx());
    expect(provider.images[0]!.req.prompt).toContain("Mood: calm.");
    expect(provider.images[0]!.req.prompt).toContain("No jokes");
  });

  it("retries once on an invalid image, then fails", async () => {
    const once = makeService({ faults: (_t, n) => (n === 0 ? "bad_image" : undefined) });
    await once.service.generatePanel({ avatar: AVATAR, panel, serious: false, style: STYLE }, ctx());
    expect(once.provider.images).toHaveLength(2);

    const always = makeService({ faults: "bad_image" });
    const err = await aiError(
      always.service.generatePanel({ avatar: AVATAR, panel, serious: false, style: STYLE }, ctx()),
    );
    expect(err.code).toBe("generation_failed");
    expect(always.provider.images).toHaveLength(2);
  });
});

describe("generateAvatar", () => {
  it("sends the selfie only to the avatar step, with tweaks in a fixed template", async () => {
    const { service, provider } = makeService();
    await service.generateAvatar(
      {
        selfie: SELFIE,
        tweaks: { hairStyle: "locs", glasses: true, note: "freckles <b>and</b> a gap tooth" },
        style: STYLE,
      },
      ctx(),
    );
    const { req } = provider.images[0]!;
    expect(req.task).toBe("avatar");
    expect(req.reference).toBe(SELFIE);
    expect(req.prompt).toContain("Hair style: locs. Wearing glasses.");
    expect(req.prompt).toContain('"freckles b and b a gap tooth"');
    expect(req.prompt).not.toMatch(/[<>]/);
  });

  it("moderates the note and removes personal data from it", async () => {
    const { service, provider, moderator } = makeService();
    const err = await aiError(
      service.generateAvatar(
        { selfie: SELFIE, tweaks: { note: "make me look worthless" }, style: STYLE },
        ctx(),
      ),
    );
    expect(err.code).toBe("content_blocked");
    expect(toApiError(err).details).toEqual([{ path: "body.tweaks.note", issue: "content_blocked" }]);
    expect(provider.images).toHaveLength(0);

    await service.generateAvatar(
      { selfie: SELFIE, tweaks: { note: "curly hair, see me@x.com" }, style: STYLE },
      ctx(),
    );
    expect(moderator.texts.at(-1)).not.toContain("me@x.com");
    expect(provider.images[0]!.req.prompt).not.toContain("x.com");
  });

  it("rejects a selfie whose bytes aren't an image", async () => {
    const { service } = makeService();
    const svg = { bytes: new TextEncoder().encode("<svg/>"), mimeType: "image/png" as const };
    expect((await aiError(service.generateAvatar({ selfie: svg, style: STYLE }, ctx()))).code).toBe(
      "generation_failed",
    );
  });
});

describe("generateHoroscope", () => {
  it("returns validated text for a sign", async () => {
    const { service } = makeService();
    const text = await service.generateHoroscope(
      { sign: "leo", weekStart: "2026-10-19" },
      { requestId: "r" },
    );
    expect(text).toContain("leo");
  });

  it.each(["link", "extra_fields", "not_json"] as const)("falls back on %s output", async (fault) => {
    const { service } = makeService({ faults: fault });
    const text = await service.generateHoroscope(
      { sign: "leo", weekStart: "2026-10-19" },
      { requestId: "r" },
    );
    expect(text).toBe("Leo, the stars are taking the week off. Make time for the people who make you laugh.");
  });

  it("rejects an invalid sign or date before calling the provider", async () => {
    const { service, provider } = makeService();
    await expect(
      service.generateHoroscope({ sign: "ophiuchus" as "leo", weekStart: "2026-10-19" }, { requestId: "r" }),
    ).rejects.toThrow();
    await expect(
      service.generateHoroscope({ sign: "leo", weekStart: "next week" }, { requestId: "r" }),
    ).rejects.toThrow();
    expect(provider.json).toHaveLength(0);
  });
});

describe("logging", () => {
  it("logs model calls as metadata only", async () => {
    const lines: string[] = [];
    const prev = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "debug";
    vi.spyOn(console, "log").mockImplementation((l: string) => void lines.push(l));
    vi.spyOn(console, "error").mockImplementation((l: string) => void lines.push(l));
    try {
      const { service } = makeService({ faults: (_t, n) => (n === 0 ? "link" : undefined) });
      const secret = "Kumasi marathon with Kofi, call +1 (415) 555-0199";
      await write(service, secret);
      await service.generatePanel(
        {
          avatar: AVATAR,
          panel: { setting: "a track", action: "running", mood: "proud", props: [] },
          serious: false,
          style: STYLE,
        },
        ctx(),
      );
    } finally {
      process.env.LOG_LEVEL = prev;
    }
    const all = lines.join("\n");
    expect(lines.some((l) => l.includes('"event":"ai_call"'))).toBe(true);
    expect(lines.some((l) => l.includes('"rejectReason":"link"'))).toBe(true);
    for (const leak of ["Kumasi", "Kofi", "555-0199", "a track", "running", "Single comic panel", "user-1"]) {
      expect(all).not.toContain(leak);
    }
  });
});
