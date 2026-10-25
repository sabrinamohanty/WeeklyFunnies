import type { AiProvider, CallContext, Moderator, ModerationResult } from "../../types";

/**
 * Plug-in point for the real model vendor. This is the only directory allowed to import vendor SDKs.
 *
 * To integrate a vendor, implement these methods so that they:
 * - send `system` and `user` as separate roles, and request structured JSON output with `jsonSchema`;
 * - pass `ctx.signal` to the SDK so calls are cancelled at the deadline;
 * - return the raw output untouched (the AiService validates it) and fill CallMeta;
 * - never log prompts or outputs, and never add tools, browsing, or code execution.
 *
 * Until then every call fails, which the AiService reports as provider_unavailable.
 */
export class RealProvider implements AiProvider {
  readonly id = "real";

  constructor(
    private readonly settings: { apiKey: string; baseUrl?: string; textModel: string; imageModel: string },
  ) {}

  async completeJson(_req: Parameters<AiProvider["completeJson"]>[0], _ctx: CallContext): Promise<never> {
    void this.settings;
    throw new Error("real AI provider is not integrated yet");
  }

  async generateImage(_req: Parameters<AiProvider["generateImage"]>[0], _ctx: CallContext): Promise<never> {
    throw new Error("real AI provider is not integrated yet");
  }
}

/** Plug-in point for a real moderation vendor. Map vendor labels onto MODERATION_CATEGORIES. */
export class RealModerator implements Moderator {
  readonly id = "real";

  constructor(private readonly settings: { apiKey: string }) {}

  async checkText(_text: string, _ctx: CallContext): Promise<ModerationResult> {
    void this.settings;
    throw new Error("real moderation provider is not integrated yet");
  }
}
