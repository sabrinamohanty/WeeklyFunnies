import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config/env";
import { routes } from "@/lib/contract/routes";
import { errorResponse, newRequestId } from "@/lib/http/handler";
import { ApiError } from "@/lib/http/errors";

const compiled = Object.values(routes).map((r) => ({
  method: r.method as string,
  pattern: new RegExp(`^${r.path.replace(/\{\w+\}/g, "[^/]+")}/?$`),
}));

/**
 * CORS for the separate web app: exact-origin allowlist, bearer tokens only (no cookies, so no
 * credentials mode). Requests from other origins get no CORS headers, so browsers block them.
 */
function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !getConfig().CORS_ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-expose-headers": "x-request-id, retry-after",
    vary: "Origin",
  };
}

function withHeaders<T extends Response>(res: T, headers: Record<string, string>): T {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

/**
 * Answers unknown paths (404) and unsupported methods (405) with the standard error envelope,
 * instead of Next's default HTML or empty responses, and handles CORS preflight.
 */
export function proxy(req: NextRequest) {
  const cors = corsHeaders(req);
  const matches = compiled.filter((r) => r.pattern.test(req.nextUrl.pathname));
  if (matches.length === 0)
    return withHeaders(errorResponse(new ApiError("not_found"), newRequestId()), cors);

  const methods = matches.map((r) => r.method);
  if (req.method === "OPTIONS" && cors["access-control-allow-origin"]) {
    const requested = req.headers.get("access-control-request-method");
    if (requested && methods.includes(requested)) {
      return withHeaders(new NextResponse(null, { status: 204 }), {
        ...cors,
        "access-control-allow-methods": methods.join(", "),
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "600",
      });
    }
  }
  if (req.method === "HEAD" || req.method === "OPTIONS" || !methods.includes(req.method)) {
    const res = errorResponse(new ApiError("method_not_allowed"), newRequestId());
    res.headers.set("allow", methods.join(", "));
    return withHeaders(res, cors);
  }
  return withHeaders(NextResponse.next(), cors);
}

export const config = { matcher: "/api/:path*" };
