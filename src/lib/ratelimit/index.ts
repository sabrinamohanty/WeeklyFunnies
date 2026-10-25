import { getConfig } from "@/lib/config/env";
import { serviceDb } from "@/lib/db/client";
import { PostgresRateLimiter } from "./postgres";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

/** Fixed-window limiter held in process memory. Only correct for a single process (tests, local dev). */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    w.count++;
    if (w.count > limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

let defaultLimiter: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  defaultLimiter ??=
    getConfig().RATE_LIMIT_STORE === "postgres"
      ? new PostgresRateLimiter(serviceDb)
      : new MemoryRateLimiter();
  return defaultLimiter;
}
