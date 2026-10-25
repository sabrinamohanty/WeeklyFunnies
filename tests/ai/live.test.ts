import { describe, expect, it } from "vitest";
import { getAiService } from "@/lib/ai";
import { getConfig } from "@/lib/config/env";

// Calls the configured real provider. Off by default; run with AI_LIVE_TESTS=1 and real keys.
describe.skipIf(!getConfig().AI_LIVE_TESTS)("live provider smoke test", () => {
  it("writes a valid, grounded page", async () => {
    const out = await getAiService().writePage(
      {
        weekLabel: "October 19, 2026",
        author: { userId: "u1", name: "Ama", city: "Kumasi" },
        highlights: [
          { id: "h1", text: "Ran my first 5K in Kumasi with Kofi", serious: false, inComic: true },
        ],
      },
      { requestId: "live-smoke" },
    );
    expect(out.stories[0]!.headline.length).toBeGreaterThan(0);
    expect(out.usedFallback).toBe(false);
  }, 60_000);
});
