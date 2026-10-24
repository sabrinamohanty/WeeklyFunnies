import { NextResponse, type NextRequest } from "next/server";
import { routes } from "@/lib/contract/routes";
import { errorResponse, newRequestId } from "@/lib/http/handler";
import { ApiError } from "@/lib/http/errors";

const compiled = Object.values(routes).map((r) => ({
  method: r.method as string,
  pattern: new RegExp(`^${r.path.replace(/\{\w+\}/g, "[^/]+")}/?$`),
}));

/**
 * Answers unknown paths (404) and unsupported methods (405) with the standard error envelope,
 * instead of Next's default HTML or empty responses.
 */
export function proxy(req: NextRequest) {
  const matches = compiled.filter((r) => r.pattern.test(req.nextUrl.pathname));
  if (matches.length === 0) return errorResponse(new ApiError("not_found"), newRequestId());
  if (req.method === "HEAD" || req.method === "OPTIONS") {
    return errorResponse(new ApiError("method_not_allowed"), newRequestId());
  }
  if (!matches.some((r) => r.method === req.method)) {
    const res = errorResponse(new ApiError("method_not_allowed"), newRequestId());
    res.headers.set("allow", matches.map((r) => r.method).join(", "));
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
