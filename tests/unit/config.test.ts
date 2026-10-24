import { describe, expect, it } from "vitest";
import { getConfig } from "@/lib/config/env";

const base = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key-placeholder-000000",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-placeholder-0000",
  CRON_SECRET: "x".repeat(32),
};

describe("getConfig", () => {
  it("applies defaults, including the chosen retention policy", () => {
    const c = getConfig({ ...base });
    expect(c.AI_PROVIDER).toBe("stub");
    expect(c.RETENTION_WINDOW_DAYS).toBe(30);
    expect(c.RETENTION_LOGOUT_GRACE_HOURS).toBe(24);
    expect(c.RETENTION_PUBLISHED_DAYS).toBe(30);
    expect(c.SELFIE_MAX_AGE_MINUTES).toBe(60);
    expect(c.AI_LIVE_TESTS).toBe(false);
  });

  it("treats blank optional values as unset, as in .env.example", () => {
    const c = getConfig({ ...base, AI_REAL_API_KEY: "", AI_REAL_BASE_URL: "" });
    expect(c.AI_REAL_API_KEY).toBeUndefined();
  });

  it("names missing keys without echoing any values", () => {
    const secret = "super-secret-service-key-value";
    let message = "";
    try {
      getConfig({
        ...base,
        SUPABASE_SERVICE_ROLE_KEY: secret,
        CRON_SECRET: "short",
        SUPABASE_URL: "not a url",
      });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("CRON_SECRET");
    expect(message).toContain("SUPABASE_URL");
    expect(message).not.toContain(secret);
    expect(message).not.toContain("not a url");
  });

  it("requires vendor settings only when the real provider is selected", () => {
    expect(() => getConfig({ ...base, AI_PROVIDER: "real" })).toThrow(/AI_REAL_API_KEY/);
    expect(() =>
      getConfig({
        ...base,
        AI_PROVIDER: "real",
        AI_REAL_API_KEY: "k",
        AI_REAL_TEXT_MODEL: "t",
        AI_REAL_IMAGE_MODEL: "i",
      }),
    ).not.toThrow();
  });

  it("refuses stub moderation in production", () => {
    expect(() => getConfig({ ...base, APP_ENV: "production" })).toThrow(/MODERATION_PROVIDER/);
  });

  it("rejects out-of-range numbers", () => {
    expect(() => getConfig({ ...base, RETENTION_WINDOW_DAYS: "0" })).toThrow(/RETENTION_WINDOW_DAYS/);
    expect(() => getConfig({ ...base, SIGNED_URL_TTL_SECONDS: "999999" })).toThrow(/SIGNED_URL_TTL_SECONDS/);
  });
});
