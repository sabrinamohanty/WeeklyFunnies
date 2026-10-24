// Fake, non-secret values so config parses in unit tests. Integration tests override the Supabase
// values with the local instance's keys.
const defaults: Record<string, string> = {
  APP_ENV: "test",
  LOG_LEVEL: "error",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "test-anon-key-not-a-secret-0000",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-not-a-secret",
  CRON_SECRET: "test-cron-secret-0123456789abcdef0123456789",
  AI_PROVIDER: "stub",
  MODERATION_PROVIDER: "stub",
};

for (const [k, v] of Object.entries(defaults)) {
  process.env[k] ??= v;
}
