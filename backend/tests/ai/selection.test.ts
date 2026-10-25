import { afterEach, describe, expect, it } from "vitest";
import { getAiService, selectModerator, selectProvider, setAiService } from "@/lib/ai";
import { AiError } from "@/lib/ai/errors";
import { resetConfigCache } from "@/lib/config/env";

const saved = { ...process.env };
const STORY_INPUT = {
  weekLabel: "October 19, 2026",
  people: [{ userId: "u1", name: "Ama Serwaa" }],
  highlights: [{ id: "h1", userId: "u1", text: "Baked bread with Kofi", serious: false, inComic: true }],
};

afterEach(() => {
  process.env = { ...saved };
  resetConfigCache();
  setAiService(undefined);
});

function useEnv(vars: Record<string, string>) {
  Object.assign(process.env, vars);
  resetConfigCache();
}

describe("provider selection by env var", () => {
  it("defaults to the stub provider and stub moderator", () => {
    expect(selectProvider().id).toBe("stub");
    expect(selectModerator().id).toBe("stub");
  });

  it("selects the real provider and moderator when configured", () => {
    useEnv({
      AI_PROVIDER: "real",
      AI_REAL_API_KEY: "k",
      AI_REAL_TEXT_MODEL: "t",
      AI_REAL_IMAGE_MODEL: "i",
      MODERATION_PROVIDER: "real",
      MODERATION_REAL_API_KEY: "m",
    });
    expect(selectProvider().id).toBe("real");
    expect(selectModerator().id).toBe("real");
  });

  it("the unintegrated real provider fails closed as provider_unavailable", async () => {
    useEnv({ AI_PROVIDER: "real", AI_REAL_API_KEY: "k", AI_REAL_TEXT_MODEL: "t", AI_REAL_IMAGE_MODEL: "i" });
    const err = await getAiService()
      .writeStory(STORY_INPUT, { requestId: "r" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).code).toBe("provider_unavailable");
  });

  it("the default service works end to end on the stub", async () => {
    const out = await getAiService().writeStory(STORY_INPUT, { requestId: "r", userId: "u" });
    expect(out.usedFallback).toBe(false);
    expect(out.article.byline).toBe("Ama");
  });
});
