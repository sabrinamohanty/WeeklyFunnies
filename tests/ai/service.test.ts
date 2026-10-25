import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError, toApiError } from "@/lib/ai/errors";
import { STUB_BLOCKED_IMAGE_MARKER } from "@/lib/ai/providers/stub/moderator";
import { StubProvider } from "@/lib/ai/providers/stub/provider";
import { panelCacheKey } from "@/lib/ai/service";
import { styleConfig } from "@/lib/ai/styles";
import type { AiProvider, CallContext, PageHighlight } from "@/lib/ai/types";
import { MemoryRateLimiter } from "@/lib/ratelimit";
import { unwrapUntrusted } from "@/lib/safety/delimit";
import { PAGE_SYSTEM_PROMPT, STORY_SYSTEM_PROMPT } from "@/lib/safety/prompts";
import { containsMarkup } from "@/lib/safety/redact";
import {
  AMA,
  AUTHOR,
  AVATAR,
  BREAD,
  ctx,
  H1,
  H2,
  H3,
  highlight,
  makeService,
  PHOTO,
  RecordingModerator,
  STYLE,
} from "./helpers";

const TEXT = "Ran my first 5K in Kumasi with Kofi";
const page = (
  s: ReturnType<typeof makeService>["service"],
  highlights: PageHighlight[] = [highlight(TEXT), BREAD],
  author = AUTHOR,
) => s.writePage({ weekLabel: "October 19, 2026", author, highlights }, ctx());

async function aiError(p: Promise<unknown>): Promise<AiError> {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AiError);
  return err as AiError;
}

const FAULTS = [
  "not_json",
  "extra_fields",
  "link",
  "markup",
  "ungrounded",
  "too_long",
  "bad_refs",
  "scene_text",
] as const;

const ME = { name: "Ama", look: "curly hair", avatar: AVATAR };

afterEach(() => vi.useRealTimers());

describe("writePage: shape and references", () => {
  it("returns one story per highlight, in order, and a 4-panel comic with real ids", async () => {
    const { service } = makeService();
    const p = await page(service);
    expect(p.usedFallback).toBe(false);
    expect(p.stories.map((s) => s.highlightId)).toEqual([H1, H2]);
    for (const s of p.stories) {
      expect(s.headline.startsWith("Ama")).toBe(true);
      expect(Array.from(s.headline).length).toBeLessThanOrEqual(120);
      expect(Array.from(s.body).length).toBeLessThanOrEqual(600);
    }
    expect(p.comic!.panels).toHaveLength(4);
    expect(p.comic!.panels.map((x) => x.highlightId)).toEqual([H1, H2, H1, H2]);
    for (const x of p.comic!.panels) {
      expect(x.dialogue.length).toBeLessThanOrEqual(2);
      for (const d of x.dialogue) expect(d.text.split(" ").length).toBeLessThanOrEqual(12);
    }
  });

  it("serious highlights get a story but no comic panels; all serious means no comic", async () => {
    const { service } = makeService();
    const grief = highlight("My grandmother passed away on Tuesday", { serious: true, inComic: true });
    const solo = await page(service, [grief]);
    expect(solo.stories).toHaveLength(1);
    expect(solo.stories[0]!.headline).not.toMatch(/!/);
    expect(solo.comic).toBeNull();

    const mixed = await page(service, [grief, BREAD]);
    expect(mixed.stories.map((s) => s.highlightId)).toEqual([H1, H2]);
    for (const x of mixed.comic!.panels) {
      expect(x.highlightId).toBe(H2);
      expect(`${x.scene} ${x.caption}`).not.toMatch(/Tuesday|grandmother/);
    }
  });

  it("highlights left out of the comic still get stories", async () => {
    const { service } = makeService();
    const p = await page(service, [highlight(TEXT, { inComic: false }), BREAD]);
    expect(p.stories).toHaveLength(2);
    expect(p.comic!.panels.every((x) => x.highlightId === H2)).toBe(true);
  });

  it("sends the fixed system prompt, refs instead of ids, and the name and city in delimiters", async () => {
    const { service, provider } = makeService();
    await page(service);
    const { req } = provider.json[0]!;
    expect(req.task).toBe("page");
    expect(req.system).toBe(PAGE_SYSTEM_PROMPT);
    expect(unwrapUntrusted(req.user, "name")).toBe("Ama");
    expect(unwrapUntrusted(req.user, "city")).toBe("Accra");
    expect(req.user).toContain("[h1] comic: yes | tone: light");
    expect(req.user).toContain("[h2] comic: yes | tone: light");
    for (const id of [AMA, H1, H2, "Serwaa"]) expect(req.user).not.toContain(id);
  });

  it("works without a city", async () => {
    const { service, provider } = makeService();
    expect((await page(service, undefined, { ...AUTHOR, city: null })).usedFallback).toBe(false);
    expect(provider.json[0]!.req.user).toContain("city: unknown");
  });

  it("accepts output wrapped in code fences", async () => {
    const { service } = makeService({ faults: "fenced" });
    expect((await page(service)).usedFallback).toBe(false);
  });

  it("rejects input outside the limits before calling the provider", async () => {
    const { service, provider } = makeService();
    const four = [H1, H2, H3, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"].map((id) => highlight("a", { id }));
    await expect(page(service, four)).rejects.toThrow();
    await expect(page(service, [])).rejects.toThrow();
    await expect(page(service, [highlight("a"), highlight("b")])).rejects.toThrow();
    expect(provider.json).toHaveLength(0);
  });
});

describe("writePage: validation, retry, and fallback", () => {
  it.each(FAULTS)("%s once: retries and uses the second answer", async (fault) => {
    const { service, provider } = makeService({ faults: (_t, n) => (n === 0 ? fault : undefined) });
    expect((await page(service)).usedFallback).toBe(false);
    expect(provider.json).toHaveLength(2);
  });

  it.each(FAULTS)("%s twice: falls back to safe content built from the person's own words", async (fault) => {
    const { service, provider } = makeService({ faults: fault });
    const p = await page(service);
    expect(provider.json).toHaveLength(2);
    expect(p.usedFallback).toBe(true);
    expect(p.stories).toEqual([
      { highlightId: H1, section: "news", headline: "News from Ama", body: TEXT },
      { highlightId: H2, section: "news", headline: "More from Ama", body: BREAD.text },
    ]);
    expect(p.comic!.title).toBe("Ama's week");
    expect(p.comic!.panels.every((x) => x.caption === null && x.dialogue.length === 0)).toBe(true);
    expect(p.comic!.panels.map((x) => x.highlightId)).toEqual([H1, H2, H1, H2]);
  });

  it("rejects exclamation marks in a serious story", async () => {
    const { service } = makeService({
      provider: {
        id: "cheery",
        completeJson: async () => ({
          raw: {
            stories: [
              { highlight: "h1", section: "news", headline: "Ama said goodbye!", body: "Ama said goodbye." },
            ],
            comic: null,
          },
          meta: { provider: "cheery", model: "x", latencyMs: 0 },
        }),
        generateImage: () => Promise.reject(new Error("unused")),
      },
    });
    const p = await page(service, [highlight("Said goodbye to my grandmother", { serious: true })]);
    expect(p.usedFallback).toBe(true);
  });

  it("fallback strips markup and personal data", async () => {
    const { service } = makeService({ faults: "not_json" });
    const p = await page(service, [
      highlight("<script>x</script> **party** at https://evil.example, mail a@b.com"),
    ]);
    const body = p.stories[0]!.body;
    expect(containsMarkup(body)).toBe(false);
    expect(body).not.toMatch(/evil|a@b|script>/);
    expect(body).toContain("party");
  });

  it("generated text that moderation blocks is replaced by the fallback", async () => {
    const moderator = new RecordingModerator(undefined, (t) =>
      t.includes("shared this from the week") ? { decision: "block", categories: ["harassment"] } : undefined,
    );
    const { service } = makeService({ moderator });
    expect((await page(service)).usedFallback).toBe(true);
  });
});

describe("rewriteStory", () => {
  const rewrite = (s: ReturnType<typeof makeService>["service"], previousHeadline?: string) =>
    s.rewriteStory(
      { weekLabel: "October 19, 2026", author: AUTHOR, highlight: highlight(TEXT), previousHeadline },
      ctx(),
    );

  it("writes one new story, told about the previous headline inside delimiters", async () => {
    const { service, provider } = makeService();
    const { story, usedFallback } = await rewrite(service, "Ama: Ran my first 5K");
    expect(usedFallback).toBe(false);
    expect(story.highlightId).toBe(H1);
    expect(story.headline).not.toBe("Ama: Ran my first 5K");
    const { req } = provider.json[0]!;
    expect(req.task).toBe("story");
    expect(req.system).toBe(STORY_SYSTEM_PROMPT);
    expect(unwrapUntrusted(req.user, "previous")).toBe("Ama Ran my first 5K");
    expect(req.user).not.toContain(H1);
  });

  it.each(["not_json", "link", "markup", "ungrounded", "too_long", "extra_fields"] as const)(
    "falls back after %s twice",
    async (fault) => {
      const { service } = makeService({ faults: fault });
      const { story, usedFallback } = await rewrite(service);
      expect(usedFallback).toBe(true);
      expect(story).toEqual({ highlightId: H1, section: "news", headline: "News from Ama", body: TEXT });
    },
  );
});

describe("checkEdit", () => {
  it("moderates text the author types over generated text", async () => {
    const { service, moderator } = makeService();
    await service.checkEdit(
      { text: "Ama Wins the Office Bake-Off", field: "body.stories.0.headline" },
      ctx(),
    );
    expect(moderator.texts).toEqual(["Ama Wins the Office Bake-Off"]);
    const err = await aiError(
      service.checkEdit({ text: "I want to hurt myself", field: "body.comic.title" }, ctx()),
    );
    expect(err.code).toBe("content_blocked");
    expect(toApiError(err).details).toEqual([{ path: "body.comic.title", issue: "self_harm_support" }]);
  });
});

describe("failure paths", () => {
  it("a provider timeout surfaces as provider_unavailable within the deadline", async () => {
    const { service } = makeService({ faults: "timeout", settings: { timeoutMs: 50 } });
    const started = Date.now();
    const err = await aiError(page(service));
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
    expect((await aiError(page(service))).code).toBe("provider_unavailable");
  });

  it("moderation failure fails closed: nothing is generated", async () => {
    const broken = {
      id: "broken",
      checkText: async () => Promise.reject(new Error("down")),
      checkImage: async () => Promise.reject(new Error("down")),
    };
    const { service, provider } = makeService({ moderator: broken });
    expect((await aiError(service.checkHighlight({ text: TEXT }, ctx()))).code).toBe("provider_unavailable");
    expect(
      (await aiError(service.generateAvatar({ look: "curly hair", photo: PHOTO, style: STYLE }, ctx()))).code,
    ).toBe("provider_unavailable");
    expect(provider.images).toHaveLength(0);
  });

  it("the circuit opens after repeated failures, then lets one trial through after the cooldown", async () => {
    let t = 0;
    const { service, provider } = makeService({ faults: "error", now: () => t });
    for (let i = 0; i < 3; i++) await aiError(page(service));
    expect(provider.json).toHaveLength(3);
    expect((await aiError(page(service))).code).toBe("provider_unavailable");
    expect(provider.json).toHaveLength(3);
    t += 10_000;
    await aiError(page(service));
    expect(provider.json).toHaveLength(4);
    await aiError(page(service));
    expect(provider.json).toHaveLength(4);
  });

  it("the circuit closes again after a successful trial", async () => {
    let t = 0;
    let failing = true;
    const { service } = makeService({ faults: () => (failing ? "error" : undefined), now: () => t });
    for (let i = 0; i < 3; i++) await aiError(page(service));
    t += 10_000;
    failing = false;
    expect((await page(service)).usedFallback).toBe(false);
    expect((await page(service)).usedFallback).toBe(false);
  });

  it("bounds concurrency (four panels fired in parallel with a cap of 2)", async () => {
    let inFlight = 0;
    let peak = 0;
    const inner = new StubProvider();
    const slow: AiProvider = {
      id: "slow",
      completeJson: (req, c) => inner.completeJson(req, c),
      generateImage: async (req, c: CallContext) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return inner.generateImage(req, c);
      },
    };
    const { service } = makeService({ provider: slow, settings: { maxConcurrency: 2, timeoutMs: 2_000 } });
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        service.generatePanel({ scene: `a park, shot ${i}`, character: ME, style: STYLE }, ctx()),
      ),
    );
    expect(peak).toBe(2);
  });
});

describe("daily caps", () => {
  it("caps text calls per user per day, separately per user", async () => {
    const { service } = makeService({ limiter: new MemoryRateLimiter(), settings: { dailyTextCalls: 2 } });
    await page(service);
    await page(service);
    const err = await aiError(page(service));
    expect(err.code).toBe("quota_exceeded");
    expect(toApiError(err).retryAfterSeconds).toBeGreaterThan(3_600);
    await service.writePage({ weekLabel: "x", author: AUTHOR, highlights: [BREAD] }, ctx("user-2"));
  });

  it("caps image calls", async () => {
    const { service } = makeService({ settings: { dailyImageCalls: 1 } });
    const input = { scene: "a park", character: { name: "Ama", look: "curly hair" }, style: STYLE };
    await service.generatePanel(input, ctx());
    expect((await aiError(service.generatePanel(input, ctx()))).code).toBe("quota_exceeded");
  });

  it("doesn't count blocked panels against the cap", async () => {
    const { service } = makeService({ settings: { dailyImageCalls: 1 } });
    const character = { name: "Ama", look: "curly hair" };
    await aiError(service.generatePanel({ scene: "going to hurt someone", character, style: STYLE }, ctx()));
    await service.generatePanel({ scene: "a park", character, style: STYLE }, ctx());
  });
});

describe("generatePanel", () => {
  const me = {
    name: "Ama Serwaa",
    look: "curly dark brown hair, round glasses, green hoodie",
    avatar: AVATAR,
  };

  it("uses the fixed template, the person's style, and their avatar as the only reference", async () => {
    const { service, provider, moderator } = makeService();
    const img = await service.generatePanel(
      { scene: "a finish line, cheering, wide shot", character: me, style: styleConfig("manga") },
      ctx(),
    );
    expect(img.mimeType).toBe("image/png");
    expect(moderator.texts).toEqual(["a finish line, cheering, wide shot"]);
    const { req } = provider.images[0]!;
    expect(req.task).toBe("panel");
    expect(req.aspectRatio).toBe("4:3");
    expect(req.references).toEqual([AVATAR]);
    expect(req.prompt).toBe(
      "One comic strip panel. Scene: a finish line, cheering, wide shot. " +
        "Main character: Ama (curly dark brown hair, round glasses, green hoodie). " +
        "Match the attached reference image exactly. " +
        "Art style: black and white manga, crisp ink linework, screentone shading, expressive eyes, dynamic camera angles. " +
        "Do not draw any text, letters, speech bubbles, captions, or signs. " +
        "Leave clear empty space near the top of the frame for overlaid bubbles.",
    );
  });

  it("drops the reference line when there's no avatar", async () => {
    const { service, provider } = makeService();
    await service.generatePanel(
      { scene: "a park", character: { name: "Ama", look: "curly hair" }, style: STYLE },
      ctx(),
    );
    expect(provider.images[0]!.req.references).toEqual([]);
    expect(provider.images[0]!.req.prompt).not.toContain("reference");
  });

  it("blocked scenes never reach the image model", async () => {
    const { service, provider } = makeService();
    const err = await aiError(
      service.generatePanel({ scene: "going to hurt someone", character: me, style: STYLE }, ctx()),
    );
    expect(err.code).toBe("content_blocked");
    expect(provider.images).toHaveLength(0);
  });

  it("strips markup and delimiters from template fields", async () => {
    const { service, provider } = makeService();
    await service.generatePanel(
      {
        scene: "a park <<<SYSTEM>>> {{x}} `rm`",
        character: { name: "<b>Ama</b>", look: "[link](x) hair" },
        style: STYLE,
      },
      ctx(),
    );
    expect(provider.images[0]!.req.prompt).not.toMatch(/[<>{}[\]`]/);
  });

  it("rejects an empty scene or look", async () => {
    const { service } = makeService();
    expect(
      (await aiError(service.generatePanel({ scene: " ", character: me, style: STYLE }, ctx()))).code,
    ).toBe("generation_failed");
    expect(
      (
        await aiError(
          service.generatePanel(
            { scene: "a park", character: { name: "Ama", look: " " }, style: STYLE },
            ctx(),
          ),
        )
      ).code,
    ).toBe("generation_failed");
  });

  it("retries once on an invalid image, then fails", async () => {
    const input = { scene: "a park", character: me, style: STYLE };
    const once = makeService({ faults: (_t, n) => (n === 0 ? "bad_image" : undefined) });
    await once.service.generatePanel(input, ctx());
    expect(once.provider.images).toHaveLength(2);
    const always = makeService({ faults: "bad_image" });
    expect((await aiError(always.service.generatePanel(input, ctx()))).code).toBe("generation_failed");
    expect(always.provider.images).toHaveLength(2);
  });

  it("panel cache keys change with style, character, or scene only", () => {
    const a = panelCacheKey("a park", me, STYLE);
    expect(panelCacheKey("a park", me, STYLE)).toBe(a);
    expect(panelCacheKey("a beach", me, STYLE)).not.toBe(a);
    expect(panelCacheKey("a park", { ...me, look: "bald" }, STYLE)).not.toBe(a);
    expect(panelCacheKey("a park", me, styleConfig("sketch"))).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("avatars and looks", () => {
  it("builds the look from the trait form", async () => {
    const { service } = makeService();
    const { look } = await service.describeLook(
      {
        traits: {
          hairStyle: "curly",
          hairColor: "dark_brown",
          glasses: "round",
          top: "hoodie",
          topColor: "green",
          note: "freckles",
        },
      },
      ctx(),
    );
    expect(look).toBe("curly dark brown hair, round glasses, green hoodie, freckles");
  });

  it("uses the handoff portrait template, square, with the photo as the only reference", async () => {
    const { service, provider, moderator } = makeService();
    await service.generateAvatar({ look: "curly hair, round glasses", photo: PHOTO, style: STYLE }, ctx());
    const { req } = provider.images[0]!;
    expect(req.task).toBe("avatar");
    expect(req.aspectRatio).toBe("1:1");
    expect(req.references).toEqual([PHOTO]);
    expect(moderator.images).toEqual([PHOTO]);
    expect(req.prompt).toBe(
      "Character portrait of one person, shoulders up, plain background. Appearance: curly hair, round glasses. " +
        `Art style: ${STYLE.fragment}. Do not draw any text, letters, speech bubbles, captions, or signs.`,
    );
  });

  it("generates from the look alone when there's no photo", async () => {
    const { service, provider } = makeService();
    await service.generateAvatar({ look: "bald head, beard", style: STYLE }, ctx());
    expect(provider.images[0]!.req.references).toEqual([]);
  });

  it("blocks a photo the moderator rejects before any model sees it", async () => {
    const { service, provider } = makeService();
    const bad = {
      bytes: new Uint8Array([...PHOTO.bytes, ...Buffer.from(STUB_BLOCKED_IMAGE_MARKER)]),
      mimeType: "image/png" as const,
    };
    const err = await aiError(
      service.generateAvatar({ look: "curly hair", photo: bad, style: STYLE }, ctx()),
    );
    expect(err.code).toBe("content_blocked");
    expect(toApiError(err).details).toEqual([{ path: "body.photo", issue: "content_blocked" }]);
    expect(provider.images).toHaveLength(0);
    expect((await aiError(service.checkPhoto({ image: bad }, ctx()))).code).toBe("content_blocked");
    await service.checkPhoto({ image: PHOTO }, ctx());
  });

  it("rejects a photo whose bytes aren't an image", async () => {
    const { service } = makeService();
    const svg = { bytes: new TextEncoder().encode("<svg/>"), mimeType: "image/png" as const };
    expect((await aiError(service.generateAvatar({ look: "x", photo: svg, style: STYLE }, ctx()))).code).toBe(
      "generation_failed",
    );
  });
});

describe("generateHoroscope", () => {
  it("returns validated text for a sign", async () => {
    const { service } = makeService();
    expect(
      await service.generateHoroscope({ sign: "leo", weekStart: "2026-10-19" }, { requestId: "r" }),
    ).toContain("leo");
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
      await page(service, [highlight("Kumasi marathon with Kofi, call +1 (415) 555-0199")]);
      await service.generatePanel({ scene: "a track, running", character: ME, style: STYLE }, ctx());
    } finally {
      process.env.LOG_LEVEL = prev;
    }
    const all = lines.join("\n");
    expect(lines.some((l) => l.includes('"event":"ai_call"'))).toBe(true);
    expect(lines.some((l) => l.includes('"rejectReason":"link"'))).toBe(true);
    for (const leak of [
      "Kumasi",
      "Accra",
      "Kofi",
      "555-0199",
      "a track",
      "curly",
      "One comic strip panel",
      "user-1",
      AMA,
    ]) {
      expect(all).not.toContain(leak);
    }
  });
});
