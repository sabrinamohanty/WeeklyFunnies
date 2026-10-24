import { z } from "zod";

export const ERROR_CODES = {
  bad_request: { status: 400, message: "The request was invalid." },
  unauthorized: { status: 401, message: "Sign in to continue." },
  forbidden: { status: 403, message: "You can't do that." },
  not_found: { status: 404, message: "Not found." },
  method_not_allowed: { status: 405, message: "Method not allowed." },
  conflict: { status: 409, message: "That conflicts with the current state." },
  edition_locked: { status: 409, message: "This edition is published and can't be changed." },
  payload_too_large: { status: 413, message: "That upload is too large." },
  unsupported_media: { status: 415, message: "That file type isn't supported." },
  content_blocked: { status: 422, message: "We can't publish that. Please rewrite it and try again." },
  rate_limited: { status: 429, message: "Too many requests. Try again shortly." },
  quota_exceeded: { status: 429, message: "You've reached today's limit. Try again tomorrow." },
  internal: { status: 500, message: "Something went wrong." },
  not_implemented: { status: 501, message: "Not implemented yet." },
  provider_unavailable: { status: 503, message: "Generation is temporarily unavailable. Try again later." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export const errorCodeSchema = z.enum(Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

export const errorDetailSchema = z
  .strictObject({
    path: z.string().meta({ description: "Dotted path of the offending field, e.g. body.name." }),
    issue: z.string().meta({ description: "Machine-readable issue code, e.g. too_big, unrecognized_keys." }),
  })
  .meta({ id: "ErrorDetail" });

export const errorEnvelopeSchema = z
  .strictObject({
    error: z.strictObject({
      code: errorCodeSchema,
      message: z.string().meta({ description: "Generic, user-safe message. Never contains internals." }),
      requestId: z.string(),
      details: z.array(errorDetailSchema).optional(),
      retryAfterSeconds: z.number().int().positive().optional(),
    }),
  })
  .meta({ id: "ErrorEnvelope" });

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
