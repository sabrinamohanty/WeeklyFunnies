import { describe, expect, it } from "vitest";
import { getAiService } from "@/lib/ai";
import { getConfig } from "@/lib/config/env";

// Calls the configured real provider. Off by default; run with AI_LIVE_TESTS=1 and real keys.
describe.skipIf(!getConfig().AI_LIVE_TESTS)("live provider smoke test", () => {
  it("writes a valid, grounded event", async () => {
    const out = await getAiService().writeEvent(
      { text: "Ran my first 5K in Kumasi with Kofi", serious: false, authorFirstName: "Ama" },
      { requestId: "live-smoke" },
    );
    expect(out.headline.length).toBeGreaterThan(0);
    expect(out.usedFallback).toBe(false);
  }, 60_000);
});
