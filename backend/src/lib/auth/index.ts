import { timingSafeEqual } from "node:crypto";
import { serviceDb } from "@/lib/db/client";
import { ApiError } from "@/lib/http/errors";
import { log } from "@/lib/log/logger";

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

function sessionIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

/**
 * Verifies a Supabase access token with Supabase Auth. This checks the signature, expiry, and that the
 * user and session still exist, so tokens from signed-out sessions stop working. Expired, tampered,
 * and revoked tokens all answer 401.
 */
export const supabaseAuthenticator: Authenticator = async (req) => {
  const token = bearerToken(req);
  if (!token) throw new ApiError("unauthorized");

  const { data, error } = await serviceDb().auth.getUser(token);
  if (error || !data.user) {
    if (error && (error.status === undefined || error.status >= 500)) {
      log.warn("auth.verify_unavailable", { status: error.status ?? null });
      throw new ApiError("internal");
    }
    throw new ApiError("unauthorized");
  }
  const sessionId = sessionIdFromToken(token);
  if (!sessionId) throw new ApiError("unauthorized");
  return { id: data.user.id, sessionId };
};

export const defaultAuthenticator: Authenticator = supabaseAuthenticator;

/** Constant-time check of the cron shared secret. */
export function verifyCronSecret(req: Request, secret: string): void {
  const token = bearerToken(req);
  if (!token) throw new ApiError("unauthorized");
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError("unauthorized");
}
