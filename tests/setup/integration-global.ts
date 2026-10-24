import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    supabase: { url: string; anonKey: string; serviceKey: string };
  }
}

/** Reads the local Supabase URL and keys from `supabase status`, so tests never hard-code keys. */
export default function setup(project: TestProject) {
  let out: string;
  try {
    out = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("Local Supabase is not running. Start it with `pnpm db:start`.");
  }
  const env: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2];
  }
  const url = env.API_URL;
  const anonKey = env.ANON_KEY ?? env.PUBLISHABLE_KEY;
  const serviceKey = env.SERVICE_ROLE_KEY ?? env.SECRET_KEY;
  if (!url || !anonKey || !serviceKey)
    throw new Error("Could not read local Supabase keys from `supabase status`.");
  project.provide("supabase", { url, anonKey, serviceKey });
}
