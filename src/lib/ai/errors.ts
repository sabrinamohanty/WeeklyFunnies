import { ApiError } from "@/lib/http/errors";

export type AiErrorCode = "content_blocked" | "generation_failed" | "provider_unavailable" | "quota_exceeded";

/** Thrown by the AiService. Routes convert it with toApiError; jobs store `code` as the failure reason. */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    readonly opts: { reason?: "self_harm"; field?: string; retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(code, { cause: opts.cause });
    this.name = "AiError";
  }
}

export function toApiError(err: AiError): ApiError {
  switch (err.code) {
    case "content_blocked":
      return err.opts.reason === "self_harm"
        ? new ApiError("content_blocked", {
            message: "self_harm_support",
            details: [{ path: err.opts.field ?? "body.text", issue: "self_harm_support" }],
          })
        : new ApiError("content_blocked", {
            details: err.opts.field ? [{ path: err.opts.field, issue: "content_blocked" }] : undefined,
          });
    case "quota_exceeded":
      return new ApiError("quota_exceeded", { retryAfterSeconds: err.opts.retryAfterSeconds });
    case "generation_failed":
    case "provider_unavailable":
      return new ApiError("provider_unavailable");
  }
}
