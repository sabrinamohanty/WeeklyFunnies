import type { z } from "zod";
import { ERROR_CODES, SAFE_MESSAGES, type ErrorCode, type SafeMessage } from "@/lib/contract/errors";

export interface ErrorDetail {
  path: string;
  issue: string;
}

/**
 * An error that is safe to show the client. The message is the generic one for the code, or a fixed
 * entry from SAFE_MESSAGES. It never contains caller-supplied text.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetail[];
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    opts: {
      details?: ErrorDetail[];
      retryAfterSeconds?: number;
      message?: SafeMessage;
      cause?: unknown;
    } = {},
  ) {
    super(opts.message ? SAFE_MESSAGES[opts.message] : ERROR_CODES[code].message, { cause: opts.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.details = opts.details;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

/** Converts Zod issues to path and issue code only. Input values are never echoed back. */
export function zodDetails(prefix: string, error: z.ZodError): ErrorDetail[] {
  return error.issues.slice(0, 20).flatMap((issue): ErrorDetail[] => {
    const base = [prefix, ...issue.path.map(String)].join(".");
    if (issue.code === "unrecognized_keys") {
      return issue.keys.slice(0, 10).map((k) => ({ path: `${base}.${k}`.slice(0, 120), issue: issue.code }));
    }
    return [{ path: base.slice(0, 120), issue: issue.code }];
  });
}
