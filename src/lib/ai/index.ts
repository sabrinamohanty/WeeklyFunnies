import { getConfig } from "@/lib/config/env";
import { getRateLimiter } from "@/lib/ratelimit";
import { RealModerator, RealProvider } from "./providers/real/provider";
import { StubModerator } from "./providers/stub/moderator";
import { StubProvider } from "./providers/stub/provider";
import { createAiService } from "./service";
import type { AiProvider, AiService, Moderator } from "./types";

export { AiError, toApiError } from "./errors";
export { createAiService, firstNameOf, panelCacheKey } from "./service";
export { STYLES, styleConfig } from "./styles";
export type * from "./types";

export function selectProvider(): AiProvider {
  const c = getConfig();
  if (c.AI_PROVIDER === "real") {
    return new RealProvider({
      apiKey: c.AI_REAL_API_KEY!,
      baseUrl: c.AI_REAL_BASE_URL,
      textModel: c.AI_REAL_TEXT_MODEL!,
      imageModel: c.AI_REAL_IMAGE_MODEL!,
    });
  }
  return new StubProvider();
}

export function selectModerator(): Moderator {
  const c = getConfig();
  return c.MODERATION_PROVIDER === "real"
    ? new RealModerator({ apiKey: c.MODERATION_REAL_API_KEY! })
    : new StubModerator();
}

let service: AiService | undefined;

/** The process-wide AiService, built from config on first use. */
export function getAiService(): AiService {
  if (!service) {
    const c = getConfig();
    service = createAiService({
      provider: selectProvider(),
      moderator: selectModerator(),
      limiter: getRateLimiter(),
      settings: {
        timeoutMs: c.AI_TIMEOUT_MS,
        maxConcurrency: c.AI_MAX_CONCURRENCY,
        dailyTextCalls: c.AI_USER_DAILY_TEXT_CALLS,
        dailyImageCalls: c.AI_USER_DAILY_IMAGE_CALLS,
        circuitFailureThreshold: c.AI_CIRCUIT_FAILURE_THRESHOLD,
        circuitCooldownMs: c.AI_CIRCUIT_COOLDOWN_MS,
      },
    });
  }
  return service;
}

/** Tests only: replace or reset the process-wide service. */
export function setAiService(next: AiService | undefined): void {
  service = next;
}
