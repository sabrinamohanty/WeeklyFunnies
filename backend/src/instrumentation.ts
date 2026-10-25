// Validates configuration once when the server boots, so a bad deploy fails fast.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getConfig } = await import("@/lib/config/env");
    getConfig();
  }
}
