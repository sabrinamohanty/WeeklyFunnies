import { inject } from "vitest";
import { resetConfigCache } from "@/lib/config/env";
import { resetServiceDb } from "@/lib/db/client";

// Point the API's config at the local Supabase instance for route-level integration tests.
const { url, anonKey, serviceKey } = inject("supabase");
process.env.SUPABASE_URL = url;
process.env.SUPABASE_ANON_KEY = anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
process.env.RATE_LIMIT_STORE = "postgres";
// High limits so the shared text fixture can run. Rate-limit tests restore the real values.
process.env.RATE_LIMIT_USER_PER_MINUTE = "100000";
process.env.RATE_LIMIT_IP_PER_MINUTE = "100000";
process.env.RATE_LIMIT_ROUTE_SCALE = "100";
resetConfigCache();
resetServiceDb();
