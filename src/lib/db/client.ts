import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { getConfig } from "@/lib/config/env";
import type { Database } from "./types";

export type Db = SupabaseClient<Database>;

let service: Db | undefined;

/**
 * Service-role client. Bypasses row-level security, so every caller must check auth, membership,
 * and ownership itself. Server-only; never expose its key.
 */
export function serviceDb(): Db {
  if (!service) {
    const c = getConfig();
    service = createClient<Database>(c.SUPABASE_URL, c.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-client-info": "meanwhile-api" } },
    });
  }
  return service;
}

export function resetServiceDb(): void {
  service = undefined;
}
