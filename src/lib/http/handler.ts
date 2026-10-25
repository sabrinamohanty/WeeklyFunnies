import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { type AuthUser, type Authenticator, defaultAuthenticator, verifyCronSecret } from "@/lib/auth";
import { getConfig } from "@/lib/config/env";
import type { RouteContract } from "@/lib/contract/routes";
import { log } from "@/lib/log/logger";
import { type RateLimiter, getRateLimiter } from "@/lib/ratelimit";
import { readBodyBytes, readJsonBody } from "./body";
import { ApiError, zodDetails } from "./errors";

type Infer<T> = T extends z.ZodType ? z.output<T> : undefined;
type BodyOf<C extends RouteContract> = C["body"] extends { kind: "json"; schema: infer S }
  ? Infer<S>
  : C["body"] extends { kind: "multipart" }
    ? { bytes: Uint8Array; contentType: string }
    : undefined;

export interface RouteContext<C extends RouteContract> {
  req: Request;
  requestId: string;
  ip: string;
  user: C["auth"] extends "user" ? AuthUser : null;
  params: Infer<C["params"]>;
  query: Infer<C["query"]>;
  body: BodyOf<C>;
}

export interface RouteResult<C extends RouteContract> {
  data: z.input<C["success"]["schema"]>;
  status?: number;
}

export interface RouteDeps {
  authenticate?: Authenticator;
  rateLimiter?: RateLimiter;
}

type NextRouteArgs = { params: Promise<Record<string, string | string[]>> };

const WINDOW_MS = 60_000;

export function newRequestId(): string {
  return `req_${randomBytes(12).toString("base64url")}`;
}

/** Best-effort client IP. Trusted only behind Vercel, which sets x-real-ip and x-forwarded-for. */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd ? fwd.slice(0, 64) : "unknown";
}

function json(
  status: number,
  payload: unknown,
  requestId: string,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
      ...extra,
    },
  });
}

export function errorResponse(err: ApiError, requestId: string): Response {
  const headers: Record<string, string> = {};
  if (err.retryAfterSeconds) headers["retry-after"] = String(err.retryAfterSeconds);
  return json(
    err.status,
    {
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details?.length ? { details: err.details } : {}),
        ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
      },
    },
    requestId,
    headers,
  );
}

function parse<T extends z.ZodType>(schema: T, input: unknown, prefix: string): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError("bad_request", { details: zodDetails(prefix, result.error) });
  return result.data;
}

async function enforceRateLimit(limiter: RateLimiter, key: string, limit: number): Promise<void> {
  const r = await limiter.consume(key, limit, WINDOW_MS);
  if (!r.allowed) throw new ApiError("rate_limited", { retryAfterSeconds: r.retryAfterSeconds });
}

/**
 * Wraps a route handler with the standard pipeline, in this order:
 * request id, IP rate limit, authentication, user rate limit, params, query, body, handler,
 * success envelope. Every failure becomes the standard error envelope. Unknown errors are logged
 * by name only and returned as a generic `internal` error.
 */
export function defineRoute<C extends RouteContract>(
  contract: C,
  handler: (ctx: RouteContext<C>) => Promise<RouteResult<C>>,
  deps: RouteDeps = {},
) {
  const routeId = `${contract.method} ${contract.path}`;

  return async function route(req: Request, next?: NextRouteArgs): Promise<Response> {
    const requestId = newRequestId();
    const started = performance.now();
    let userId: string | undefined;
    let response: Response;

    try {
      const config = getConfig();
      const limiter = deps.rateLimiter ?? getRateLimiter();
      const ip = clientIp(req);

      if (contract.auth !== "cron") {
        await enforceRateLimit(limiter, `ip:${ip}`, config.RATE_LIMIT_IP_PER_MINUTE);
      }

      let user: AuthUser | null = null;
      if (contract.auth === "user") {
        user = await (deps.authenticate ?? defaultAuthenticator)(req);
        userId = user.id;
        await enforceRateLimit(limiter, `user:${user.id}`, config.RATE_LIMIT_USER_PER_MINUTE);
        if (contract.rateLimit) {
          await enforceRateLimit(
            limiter,
            `user:${user.id}:${routeId}`,
            Math.max(1, Math.ceil(contract.rateLimit.perUserPerMinute * config.RATE_LIMIT_ROUTE_SCALE)),
          );
        }
      } else if (contract.auth === "cron") {
        verifyCronSecret(req, config.CRON_SECRET);
      }

      const rawParams = next?.params ? await next.params : {};
      const params = contract.params ? parse(contract.params, rawParams, "params") : undefined;

      const url = new URL(req.url);
      const rawQuery: Record<string, string> = {};
      for (const [k, v] of url.searchParams) rawQuery[k] = v;
      if (!contract.query && Object.keys(rawQuery).length > 0) {
        throw new ApiError("bad_request", {
          details: Object.keys(rawQuery)
            .slice(0, 10)
            .map((k) => ({ path: `query.${k}`.slice(0, 120), issue: "unrecognized_keys" })),
        });
      }
      const query = contract.query ? parse(contract.query, rawQuery, "query") : undefined;

      let body: unknown;
      if (contract.body?.kind === "json") {
        body = parse(contract.body.schema, await readJsonBody(req, contract.body.maxBytes), "body");
      } else if (contract.body?.kind === "multipart") {
        const contentType = req.headers.get("content-type") ?? "";
        if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) throw new ApiError("unsupported_media");
        body = { bytes: await readBodyBytes(req, contract.body.maxBytes), contentType };
      } else {
        const bytes = await readBodyBytes(req, 1024);
        if (bytes.byteLength > 0)
          throw new ApiError("bad_request", { details: [{ path: "body", issue: "unexpected_body" }] });
      }

      const result = await handler({
        req,
        requestId,
        ip,
        user: user as RouteContext<C>["user"],
        params: params as RouteContext<C>["params"],
        query: query as RouteContext<C>["query"],
        body: body as BodyOf<C>,
      });
      response = json(result.status ?? contract.success.status, { data: result.data }, requestId);
    } catch (err) {
      if (err instanceof ApiError) {
        response = errorResponse(err, requestId);
      } else {
        log.error("request.unhandled_error", {
          requestId,
          routeId,
          errorName: err instanceof Error ? err.name : typeof err,
        });
        response = errorResponse(new ApiError("internal"), requestId);
      }
    }

    log.info("request", {
      requestId,
      routeId,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      userId,
    });
    return response;
  };
}

/** Placeholder for routes whose phase hasn't been built. Runs the full pipeline, then answers 501. */
export function notImplemented<C extends RouteContract>(contract: C, deps?: RouteDeps) {
  return defineRoute(
    contract,
    async () => {
      throw new ApiError("not_implemented");
    },
    deps,
  );
}
