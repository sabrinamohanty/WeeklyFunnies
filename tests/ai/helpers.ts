import { createAiService, type AiSettings } from "@/lib/ai/service";
import { StubModerator } from "@/lib/ai/providers/stub/moderator";
import { StubProvider, type FaultPlan } from "@/lib/ai/providers/stub/provider";
import { solidPng } from "@/lib/ai/providers/stub/png";
import { styleConfig } from "@/lib/ai/styles";
import type {
  AiProvider,
  CallContext,
  ImageBytes,
  Moderator,
  ModerationResult,
  PageAuthor,
  PageHighlight,
} from "@/lib/ai/types";
import { MemoryRateLimiter } from "@/lib/ratelimit";

export const SETTINGS: AiSettings = {
  timeoutMs: 200,
  maxConcurrency: 4,
  dailyTextCalls: 1_000,
  dailyImageCalls: 1_000,
  circuitFailureThreshold: 3,
  circuitCooldownMs: 10_000,
};

export const STYLE = styleConfig("classic");
export const AVATAR: ImageBytes = { bytes: solidPng([10, 20, 30]), mimeType: "image/png" };
export const AVATAR_2: ImageBytes = { bytes: solidPng([40, 50, 60]), mimeType: "image/png" };
export const PHOTO: ImageBytes = { bytes: solidPng([200, 150, 100]), mimeType: "image/png" };
export const ctx = (userId = "user-1") => ({ requestId: "req_test", userId });

export const AMA = "11111111-1111-4111-8111-111111111111";
export const H1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const H2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const H3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export const AUTHOR: PageAuthor = { userId: AMA, name: "Ama Serwaa", city: "Accra" };

export const highlight = (text: string, extra: Partial<PageHighlight> = {}): PageHighlight => ({
  id: H1,
  text,
  serious: false,
  inComic: true,
  ...extra,
});

export const BREAD: PageHighlight = {
  id: H2,
  text: "Baked sourdough bread for the first time",
  serious: false,
  inComic: true,
};

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
  readonly images: ImageBytes[] = [];

  constructor(
    private readonly inner: Moderator = new StubModerator(),
    private readonly override?: (text: string) => ModerationResult | undefined,
  ) {}

  async checkText(text: string, c: CallContext) {
    this.texts.push(text);
    return this.override?.(text) ?? this.inner.checkText(text, c);
  }

  async checkImage(image: ImageBytes, c: CallContext) {
    this.images.push(image);
    return this.inner.checkImage(image, c);
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
