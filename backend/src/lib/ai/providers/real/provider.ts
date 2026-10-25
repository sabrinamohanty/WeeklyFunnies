import type { AiProvider, CallContext, ImageBytes, Moderator, ModerationResult } from "../../types";

/**
 * Plug-in point for the real model vendors. This is the only directory allowed to import vendor SDKs.
 *
 * Planned vendors (from the comic pipeline handoff), configured by AI_REAL_* env vars:
 * - Text (`completeJson`): Anthropic Messages API, model from AI_REAL_TEXT_MODEL. Send `system` as the
 *   system prompt and `user` as the single user message. Ask for JSON matching `jsonSchema`.
 * - Images (`generateImage`): Meta Muse Image through the AI/ML API gateway (AI_REAL_BASE_URL).
 *   No references: model `meta/muse-image`. With references (the photo for avatars, the characters'
 *   avatars for panels): `meta/muse-image-edit` with them as `image_urls` (1 to 10, base64 is accepted).
 *   Pass `prompt`, `aspect_ratio` (req.aspectRatio), and `output_format`; read `data[0].b64_json` or
 *   fetch `data[0].url` server-side. Confirm endpoint, auth header, and model ids before going live.
 *
 * Rules for any implementation:
 * - pass `ctx.signal` so calls are cancelled at the deadline;
 * - return the raw output untouched (the AiService validates it) and fill CallMeta;
 * - never log prompts, outputs, or images, and never add tools, browsing, or code execution.
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

/** Plug-in point for a real moderation vendor (text and images). Map labels onto MODERATION_CATEGORIES. */
export class RealModerator implements Moderator {
  readonly id = "real";

  constructor(private readonly settings: { apiKey: string }) {}

  async checkText(_text: string, _ctx: CallContext): Promise<ModerationResult> {
    void this.settings;
    throw new Error("real moderation provider is not integrated yet");
  }

  async checkImage(_image: ImageBytes, _ctx: CallContext): Promise<ModerationResult> {
    throw new Error("real moderation provider is not integrated yet");
  }
}
