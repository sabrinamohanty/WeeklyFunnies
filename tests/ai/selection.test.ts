import { afterEach, describe, expect, it } from "vitest";
import { getAiService, selectModerator, selectProvider, setAiService, styleConfig } from "@/lib/ai";
import { AiError } from "@/lib/ai/errors";
import { resetConfigCache } from "@/lib/config/env";

const saved = { ...process.env };

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
    expect(styleConfig()).toEqual({ styleId: "default" });
  });

  it("selects the real provider and moderator when configured", () => {
    useEnv({
      AI_PROVIDER: "real",
      AI_REAL_API_KEY: "k",
      AI_REAL_TEXT_MODEL: "t",
      AI_REAL_IMAGE_MODEL: "i",
      MODERATION_PROVIDER: "real",
      MODERATION_REAL_API_KEY: "m",
      AI_STYLE_ID: "ink",
    });
    expect(selectProvider().id).toBe("real");
    expect(selectModerator().id).toBe("real");
    expect(styleConfig()).toEqual({ styleId: "ink" });
  });

  it("the unintegrated real provider fails closed as provider_unavailable", async () => {
    useEnv({ AI_PROVIDER: "real", AI_REAL_API_KEY: "k", AI_REAL_TEXT_MODEL: "t", AI_REAL_IMAGE_MODEL: "i" });
    const err = await getAiService()
      .writeEvent({ text: "Baked bread", serious: false, authorFirstName: "Ama" }, { requestId: "r" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).code).toBe("provider_unavailable");
  });

  it("the default service works end to end on the stub", async () => {
    const out = await getAiService().writeEvent(
      { text: "Baked bread with Kofi", serious: false, authorFirstName: "Ama" },
      { requestId: "r", userId: "u" },
    );
    expect(out.usedFallback).toBe(false);
    expect(out.headline).toContain("Ama");
  });
});
