import { z } from "zod";

const int = (def: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(def);

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalString = z.preprocess(blankToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(blankToUndefined, z.url().optional());

const flag = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

export const envSchema = z
  .object({
    APP_ENV: z.enum(["local", "test", "preview", "production"]).default("local"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    // Supabase. Only SUPABASE_URL and SUPABASE_ANON_KEY are ever given to the app.
    SUPABASE_URL: z.url(),
    SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

    // Shared secret for cron-only internal routes.
    CRON_SECRET: z.string().min(32),

    // AI and moderation: provider selection only. Vendor details live inside the real provider.
    AI_PROVIDER: z.enum(["stub", "real"]).default("stub"),
    MODERATION_PROVIDER: z.enum(["stub", "real"]).default("stub"),
    AI_REAL_API_KEY: optionalString,
    AI_REAL_BASE_URL: optionalUrl,
    AI_REAL_TEXT_MODEL: optionalString,
    AI_REAL_IMAGE_MODEL: optionalString,
    MODERATION_REAL_API_KEY: optionalString,
    AI_STYLE_ID: z.string().min(1).max(64).default("default"),

    // AI cost and abuse limits.
    AI_TIMEOUT_MS: int(30_000, 1_000, 120_000),
    AI_MAX_CONCURRENCY: int(4, 1, 32),
    AI_USER_DAILY_TEXT_CALLS: int(40, 1, 1_000),
    AI_USER_DAILY_IMAGE_CALLS: int(20, 1, 1_000),
    AI_CIRCUIT_FAILURE_THRESHOLD: int(5, 1, 100),
    AI_CIRCUIT_COOLDOWN_MS: int(60_000, 1_000, 3_600_000),

    // Server-side secret mixed into invite code hashes, so a database leak doesn't reveal codes.
    INVITE_CODE_PEPPER: z.string().min(32),

    // Request rate limits. "memory" is only correct for a single process (tests, local dev).
    RATE_LIMIT_STORE: z.enum(["postgres", "memory"]).default("postgres"),
    RATE_LIMIT_USER_PER_MINUTE: int(60, 1, 100_000),
    RATE_LIMIT_IP_PER_MINUTE: int(120, 1, 100_000),
    // Multiplies per-route limits. Tests only; must be 1 in production.
    RATE_LIMIT_ROUTE_SCALE: z.coerce.number().min(0.01).max(1_000).default(1),

    // Retention.
    RETENTION_WINDOW_DAYS: int(30, 1, 365),
    RETENTION_LOGOUT_GRACE_HOURS: int(24, 0, 24 * 30),
    RETENTION_PUBLISHED_DAYS: int(30, 1, 365),
    SELFIE_MAX_AGE_MINUTES: int(60, 1, 24 * 60),

    // Storage.
    SIGNED_URL_TTL_SECONDS: int(600, 30, 3_600),

    // Tests only: allow live-provider smoke tests.
    AI_LIVE_TESTS: flag,
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "real") {
      for (const key of ["AI_REAL_API_KEY", "AI_REAL_TEXT_MODEL", "AI_REAL_IMAGE_MODEL"] as const) {
        if (!env[key])
          ctx.addIssue({ code: "custom", path: [key], message: "required when AI_PROVIDER=real" });
      }
    }
    if (env.MODERATION_PROVIDER === "real" && !env.MODERATION_REAL_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["MODERATION_REAL_API_KEY"],
        message: "required when MODERATION_PROVIDER=real",
      });
    }
    if (env.APP_ENV === "production" && env.RATE_LIMIT_ROUTE_SCALE !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["RATE_LIMIT_ROUTE_SCALE"],
        message: "must be 1 in production",
      });
    }
    if (env.APP_ENV === "production" && env.MODERATION_PROVIDER === "stub") {
      ctx.addIssue({
        code: "custom",
        path: ["MODERATION_PROVIDER"],
        message: "stub moderation is not allowed in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parses and caches the environment. Throws with key names only, never values. */
export function getConfig(source: Record<string, string | undefined> = process.env): Env {
  if (cached && source === process.env) return cached;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  if (source === process.env) cached = result.data;
  return result.data;
}

export function resetConfigCache(): void {
  cached = undefined;
}
