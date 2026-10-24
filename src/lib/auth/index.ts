import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/http/errors";

export interface AuthUser {
  id: string;
  /** Session id from the access token, used for sliding expiry and logout. */
  sessionId: string;
}

export type Authenticator = (req: Request) => Promise<AuthUser>;

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9._~+/=-]{1,4096})$/.exec(header);
  return match?.[1] ?? null;
}

/**
 * Fails closed until Supabase token verification lands in Phase 2: every user route
 * answers 401, so nothing is reachable without a verified identity.
 */
export const defaultAuthenticator: Authenticator = async () => {
  throw new ApiError("unauthorized");
};

/** Constant-time check of the cron shared secret. */
export function verifyCronSecret(req: Request, secret: string): void {
  const token = bearerToken(req);
  if (!token) throw new ApiError("unauthorized");
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError("unauthorized");
}
