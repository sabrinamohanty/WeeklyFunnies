import { createAiService, type AiSettings } from "@/lib/ai/service";
import { StubModerator } from "@/lib/ai/providers/stub/moderator";
import { StubProvider, type FaultPlan } from "@/lib/ai/providers/stub/provider";
import { solidPng } from "@/lib/ai/providers/stub/png";
import type { AiProvider, CallContext, ImageBytes, Moderator, ModerationResult } from "@/lib/ai/types";
import { MemoryRateLimiter } from "@/lib/ratelimit";

export const SETTINGS: AiSettings = {
  timeoutMs: 200,
  maxConcurrency: 4,
  dailyTextCalls: 1_000,
  dailyImageCalls: 1_000,
  circuitFailureThreshold: 3,
  circuitCooldownMs: 10_000,
};

export const STYLE = { styleId: "test-style" };
export const AVATAR: ImageBytes = { bytes: solidPng([10, 20, 30]), mimeType: "image/png" };
export const SELFIE: ImageBytes = { bytes: solidPng([200, 150, 100]), mimeType: "image/png" };
export const ctx = (userId = "user-1") => ({ requestId: "req_test", userId });

type JsonReq = Parameters<AiProvider["completeJson"]>[0];
type ImageReq = Parameters<AiProvider["generateImage"]>[0];

/** Records every request and context a provider receives. */
export class RecordingProvider implements AiProvider {
  readonly id: string;
  readonly json: Array<{ req: JsonReq; ctx: CallContext }> = [];
  readonly images: Array<{ req: ImageReq; ctx: CallContext }> = [];

  constructor(readonly inner: AiProvider) {
    this.id = inner.id;
  }

  completeJson(req: JsonReq, c: CallContext) {
    this.json.push({ req, ctx: c });
    return this.inner.completeJson(req, c);
  }

  generateImage(req: ImageReq, c: CallContext) {
    this.images.push({ req, ctx: c });
    return this.inner.generateImage(req, c);
  }
}

export class RecordingModerator implements Moderator {
  readonly id = "recording";
  readonly texts: string[] = [];

  constructor(
    private readonly inner: Moderator = new StubModerator(),
    private readonly override?: (text: string) => ModerationResult | undefined,
  ) {}

  async checkText(text: string, c: CallContext) {
    this.texts.push(text);
    return this.override?.(text) ?? this.inner.checkText(text, c);
  }
}

export function makeService(
  opts: {
    faults?: FaultPlan;
    provider?: AiProvider;
    moderator?: Moderator;
    settings?: Partial<AiSettings>;
    now?: () => number;
    limiter?: MemoryRateLimiter;
  } = {},
) {
  const provider = new RecordingProvider(opts.provider ?? new StubProvider(opts.faults));
  const moderator =
    opts.moderator instanceof RecordingModerator ? opts.moderator : new RecordingModerator(opts.moderator);
  const service = createAiService({
    provider,
    moderator,
    limiter: opts.limiter ?? new MemoryRateLimiter(opts.now),
    settings: { ...SETTINGS, ...opts.settings },
    now: opts.now,
  });
  return { service, provider, moderator };
}
