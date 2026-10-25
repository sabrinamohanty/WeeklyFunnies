import { createHash } from "node:crypto";
import type { Db } from "@/lib/db/client";
import { log } from "@/lib/log/logger";
import type { RateLimitResult, RateLimiter } from "./index";

/**
 * Fixed-window limiter backed by Postgres, shared across serverless instances. Keys are hashed before
 * storage. If the database call fails, the request is allowed (fail open) and a warning is logged, so
 * a rate-limit outage doesn't take the API down.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly db: () => Db) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const hashed = createHash("sha256").update(key).digest("hex");
    const { data, error } = await this.db().rpc("rate_limit_hit", {
      p_key: hashed,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
    });
    const row = data?.[0];
    if (error || !row) {
      log.warn("ratelimit.store_unavailable", { errorName: error?.code ?? "no_row" });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
  }
}
