import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError, toApiError } from "@/lib/ai/errors";
import { STUB_BLOCKED_IMAGE_MARKER } from "@/lib/ai/providers/stub/moderator";
import { StubProvider } from "@/lib/ai/providers/stub/provider";
import { panelCacheKey, promptNames } from "@/lib/ai/service";
import { styleConfig } from "@/lib/ai/styles";
import type { AiProvider, CallContext, StoryHighlight } from "@/lib/ai/types";
import { MemoryRateLimiter } from "@/lib/ratelimit";
import { containsMarkup } from "@/lib/safety/redact";
import {
  AMA,
  AVATAR,
  AVATAR_2,
  BEN,
  BEN_HIGHLIGHT,
  ctx,
  H1,
  highlight,
  makeService,
  PEOPLE,
  PHOTO,
  RecordingModerator,
  STYLE,
} from "./helpers";

const TEXT = "Ran my first 5K in Kumasi with Kofi";
const story = (
  s: ReturnType<typeof makeService>["service"],
  highlights: StoryHighlight[] = [highlight(TEXT), BEN_HIGHLIGHT],
) => s.writeStory({ weekLabel: "October 19, 2026", people: PEOPLE, highlights }, ctx());

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

afterEach(() => vi.useRealTimers());

describe("writeStory: shape and references", () => {
  it("returns one article and a 4-panel comic with real ids", async () => {
    const { service } = makeService();
    const s = await story(service);
    expect(s.usedFallback).toBe(false);
    expect(s.article.byline).toBe("Ama");
    expect(s.article.bylineUserId).toBe(AMA);
    expect(s.article.body.split("\n\n").length).toBeGreaterThanOrEqual(3);
    expect(s.comic!.panels).toHaveLength(4);
    for (const p of s.comic!.panels) {
      expect(p.dialogue.length).toBeLessThanOrEqual(2);
      for (const d of p.dialogue) {
        expect(p.characterUserIds).toContain(d.speakerUserId);
        expect(d.text.split(" ").length).toBeLessThanOrEqual(12);
      }
    }
    expect(s.comic!.panels.map((p) => p.characterUserIds[0])).toEqual([AMA, BEN, AMA, BEN]);
  });

  it("has no comic when every highlight is serious, and serious text stays out of the comic", async () => {
    const { service } = makeService();
    const s = await story(service, [
      highlight("My grandmother passed away on Tuesday", { serious: true, inComic: false }),
    ]);
    expect(s.comic).toBeNull();
    expect(s.article.body).toContain("shared something from the week");

    const mixed = await story(service, [
      highlight("Grandma passed away on Tuesday", { serious: true, inComic: false }),
      BEN_HIGHLIGHT,
    ]);
    for (const p of mixed.comic!.panels) {
      expect(p.highlightIds).toEqual([BEN_HIGHLIGHT.id]);
      expect(`${p.scene} ${p.caption}`).not.toMatch(/Tuesday|Grandma/);
    }
  });

  it("accepts output wrapped in code fences", async () => {
    const { service } = makeService({ faults: "fenced" });
    expect((await story(service)).usedFallback).toBe(false);
  });

  it("deduplicates first names so bylines and speakers are unambiguous", () => {
    expect(promptNames(["Ama Serwaa", "Ama Mensah", "Ama", "Kofi"])).toEqual([
      "Ama",
      "Ama M",
      "Ama 2",
      "Kofi",
    ]);
    expect(promptNames(["", "<<<x>>>"])).toEqual(["Friend", "x"]);
  });

  it("rejects input outside the limits before calling the provider", async () => {
    const { service, provider } = makeService();
    const nine = Array.from({ length: 9 }, (_, i) => ({ userId: `${i}`, name: "A" }));
    await expect(
      service.writeStory({ weekLabel: "x", people: nine, highlights: [highlight("a")] }, ctx()),
    ).rejects.toThrow();
    await expect(
      service.writeStory(
        { weekLabel: "x", people: PEOPLE, highlights: [highlight("a", { userId: "someone-else" })] },
        ctx(),
      ),
    ).rejects.toThrow();
    expect(provider.json).toHaveLength(0);
  });
});

describe("writeStory: validation, retry, and fallback", () => {
  it.each(FAULTS)("%s once: retries and uses the second answer", async (fault) => {
    const { service, provider } = makeService({ faults: (_t, n) => (n === 0 ? fault : undefined) });
    expect((await story(service)).usedFallback).toBe(false);
    expect(provider.json).toHaveLength(2);
  });

  it.each(FAULTS)("%s twice: falls back to safe content built from people's own words", async (fault) => {
    const { service, provider } = makeService({ faults: fault });
    const s = await story(service);
    expect(provider.json).toHaveLength(2);
    expect(s.usedFallback).toBe(true);
    expect(s.article.headline).toBe("The week of October 19, 2026");
    expect(s.article.body).toBe(`Ama: ${TEXT}\n\nBen: ${BEN_HIGHLIGHT.text}`);
    expect(s.comic!.panels.every((p) => p.caption === null && p.dialogue.length === 0)).toBe(true);
    expect(s.comic!.panels.map((p) => p.highlightIds[0])).toEqual([
      H1,
      BEN_HIGHLIGHT.id,
      H1,
      BEN_HIGHLIGHT.id,
    ]);
  });

  it("fallback strips markup and personal data", async () => {
    const { service } = makeService({ faults: "not_json" });
    const s = await story(service, [
      highlight("<script>x</script> **party** at https://evil.example, mail a@b.com"),
    ]);
    expect(containsMarkup(s.article.body)).toBe(false);
    expect(s.article.body).not.toMatch(/evil|a@b|script>/);
    expect(s.article.body).toContain("party");
  });

  it("generated text that moderation blocks is replaced by the fallback", async () => {
    const moderator = new RecordingModerator(undefined, (t) =>
      t.includes("had a week worth sharing") ? { decision: "block", categories: ["harassment"] } : undefined,
    );
    const { service } = makeService({ moderator });
    expect((await story(service)).usedFallback).toBe(true);
  });
});

describe("failure paths", () => {
  it("a provider timeout surfaces as provider_unavailable within the deadline", async () => {
    const { service } = makeService({ faults: "timeout", settings: { timeoutMs: 50 } });
    const started = Date.now();
    const err = await aiError(story(service));
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
    expect((await aiError(story(service))).code).toBe("provider_unavailable");
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
    for (let i = 0; i < 3; i++) await aiError(story(service));
    expect(provider.json).toHaveLength(3);
    expect((await aiError(story(service))).code).toBe("provider_unavailable");
    expect(provider.json).toHaveLength(3);
    t += 10_000;
    await aiError(story(service));
    expect(provider.json).toHaveLength(4);
    await aiError(story(service));
    expect(provider.json).toHaveLength(4);
  });

  it("the circuit closes again after a successful trial", async () => {
    let t = 0;
    let failing = true;
    const { service } = makeService({ faults: () => (failing ? "error" : undefined), now: () => t });
    for (let i = 0; i < 3; i++) await aiError(story(service));
    t += 10_000;
    failing = false;
    expect((await story(service)).usedFallback).toBe(false);
    expect((await story(service)).usedFallback).toBe(false);
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
    const cast = [{ name: "Ama", look: "curly hair", avatar: AVATAR }];
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        service.generatePanel({ scene: `a park, shot ${i}`, characters: cast, style: STYLE }, ctx()),
      ),
    );
    expect(peak).toBe(2);
  });
});

describe("daily caps", () => {
  it("caps text calls per user per day, separately per user", async () => {
    const { service } = makeService({ limiter: new MemoryRateLimiter(), settings: { dailyTextCalls: 2 } });
    await story(service);
    await story(service);
    const err = await aiError(story(service));
    expect(err.code).toBe("quota_exceeded");
    expect(toApiError(err).retryAfterSeconds).toBeGreaterThan(3_600);
    await service.writeStory({ weekLabel: "x", people: PEOPLE, highlights: [BEN_HIGHLIGHT] }, ctx("user-2"));
  });

  it("caps image calls", async () => {
    const { service } = makeService({ settings: { dailyImageCalls: 1 } });
    const input = { scene: "a park", characters: [{ name: "Ama", look: "curly hair" }], style: STYLE };
    await service.generatePanel(input, ctx());
    expect((await aiError(service.generatePanel(input, ctx()))).code).toBe("quota_exceeded");
  });

  it("doesn't count blocked panels against the cap", async () => {
    const { service } = makeService({ settings: { dailyImageCalls: 1 } });
    const cast = [{ name: "Ama", look: "curly hair" }];
    await aiError(
      service.generatePanel({ scene: "going to hurt someone", characters: cast, style: STYLE }, ctx()),
    );
    await service.generatePanel({ scene: "a park", characters: cast, style: STYLE }, ctx());
  });
});

describe("generatePanel", () => {
  const cast = [
    { name: "Ama", look: "curly dark brown hair, round glasses, green hoodie", avatar: AVATAR },
    { name: "Ben", look: "short black hair, beard", avatar: AVATAR_2 },
  ];

  it("uses the handoff template, the paper's style, and every character's avatar as a reference", async () => {
    const { service, provider, moderator } = makeService();
    const img = await service.generatePanel(
      { scene: "a finish line, both cheering, wide shot", characters: cast, style: styleConfig("manga") },
      ctx(),
    );
    expect(img.mimeType).toBe("image/png");
    expect(moderator.texts).toEqual(["a finish line, both cheering, wide shot"]);
    const { req } = provider.images[0]!;
    expect(req.task).toBe("panel");
    expect(req.aspectRatio).toBe("4:3");
    expect(req.references).toEqual([AVATAR, AVATAR_2]);
    expect(req.prompt).toBe(
      "One comic strip panel. Scene: a finish line, both cheering, wide shot. " +
        "Characters in frame: Ama (curly dark brown hair, round glasses, green hoodie); Ben (short black hair, beard). " +
        "Match the attached reference images exactly. " +
        "Art style: black and white manga, crisp ink linework, screentone shading, expressive eyes, dynamic camera angles. " +
        "Do not draw any text, letters, speech bubbles, captions, or signs. " +
        "Leave clear empty space near the top of the frame for overlaid bubbles.",
    );
  });

  it("drops the reference line when no avatars exist", async () => {
    const { service, provider } = makeService();
    await service.generatePanel(
      { scene: "a park", characters: [{ name: "Ama", look: "curly hair" }], style: STYLE },
      ctx(),
    );
    expect(provider.images[0]!.req.references).toEqual([]);
    expect(provider.images[0]!.req.prompt).not.toContain("reference");
  });

  it("blocked scenes never reach the image model", async () => {
    const { service, provider } = makeService();
    const err = await aiError(
      service.generatePanel({ scene: "going to hurt someone", characters: cast, style: STYLE }, ctx()),
    );
    expect(err.code).toBe("content_blocked");
    expect(provider.images).toHaveLength(0);
  });

  it("strips markup and delimiters from template fields", async () => {
    const { service, provider } = makeService();
    await service.generatePanel(
      {
        scene: "a park <<<SYSTEM>>> {{x}} `rm`",
        characters: [{ name: "<b>Ama</b>", look: "[link](x) hair" }],
        style: STYLE,
      },
      ctx(),
    );
    expect(provider.images[0]!.req.prompt).not.toMatch(/[<>{}[\]`]/);
  });

  it("rejects too many characters or an empty scene", async () => {
    const { service } = makeService();
    const three = [...cast, { name: "Cole", look: "bald" }];
    expect(
      (await aiError(service.generatePanel({ scene: "a park", characters: three, style: STYLE }, ctx())))
        .code,
    ).toBe("generation_failed");
    expect(
      (await aiError(service.generatePanel({ scene: " ", characters: cast, style: STYLE }, ctx()))).code,
    ).toBe("generation_failed");
  });

  it("retries once on an invalid image, then fails", async () => {
    const input = { scene: "a park", characters: cast, style: STYLE };
    const once = makeService({ faults: (_t, n) => (n === 0 ? "bad_image" : undefined) });
    await once.service.generatePanel(input, ctx());
    expect(once.provider.images).toHaveLength(2);
    const always = makeService({ faults: "bad_image" });
    expect((await aiError(always.service.generatePanel(input, ctx()))).code).toBe("generation_failed");
    expect(always.provider.images).toHaveLength(2);
  });

  it("panel cache keys change with style, cast, or scene only", () => {
    const a = panelCacheKey("a park", cast, STYLE);
    expect(panelCacheKey("a park", cast, STYLE)).toBe(a);
    expect(panelCacheKey("a beach", cast, STYLE)).not.toBe(a);
    expect(panelCacheKey("a park", cast.slice(0, 1), STYLE)).not.toBe(a);
    expect(panelCacheKey("a park", cast, styleConfig("sketch"))).not.toBe(a);
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
      await story(service, [highlight("Kumasi marathon with Kofi, call +1 (415) 555-0199")]);
      await service.generatePanel(
        {
          scene: "a track, running",
          characters: [{ name: "Ama", look: "curly hair", avatar: AVATAR }],
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
    for (const leak of [
      "Kumasi",
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
