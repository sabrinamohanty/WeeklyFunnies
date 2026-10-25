import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Authenticator } from "@/lib/auth";
import { type ErrorEnvelope, errorEnvelopeSchema } from "@/lib/contract/errors";
import type { RouteContract } from "@/lib/contract/routes";
import { textField } from "@/lib/contract/text";
import { ApiError } from "@/lib/http/errors";
import { defineRoute } from "@/lib/http/handler";
import { MemoryRateLimiter } from "@/lib/ratelimit";

const USER_ID = "7d3f1c1e-8a4b-4c55-9d7e-2f6b1a0c9e11";
const fakeAuth: Authenticator = async (req) => {
  if (req.headers.get("authorization") !== "Bearer good") throw new ApiError("unauthorized");
  return { id: USER_ID, sessionId: "s1" };
};

const contract = {
  method: "POST",
  path: "/api/things/{thingId}",
  summary: "test",
  tag: "test",
  auth: "user",
  phase: 0,
  params: z.strictObject({ thingId: z.uuid() }),
  body: { kind: "json", schema: z.strictObject({ name: textField({ max: 10 }) }), maxBytes: 256 },
  success: { status: 201, schema: z.strictObject({ id: z.string(), name: z.string() }) },
  errors: [],
} as const satisfies RouteContract;

const THING = "0b6f9a52-3c1d-4e8f-a2b7-5d9c0e1f2a3b";
const params = (thingId = THING) => ({ params: Promise.resolve({ thingId }) });

function request(body: unknown, headers: Record<string, string> = {}, raw?: string) {
  return new Request(`http://localhost/api/things/${THING}`, {
    method: "POST",
    headers: { authorization: "Bearer good", "content-type": "application/json", ...headers },
    body: raw ?? JSON.stringify(body),
  });
}

function makeRoute(deps: { limiter?: MemoryRateLimiter } = {}) {
  return defineRoute(
    contract,
    async ({ params, body, user }) => ({ data: { id: `${params.thingId}:${user.id}`, name: body.name } }),
    { authenticate: fakeAuth, rateLimiter: deps.limiter ?? new MemoryRateLimiter() },
  );
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const json = (await res.json()) as ErrorEnvelope;
  expect(errorEnvelopeSchema.safeParse(json).success).toBe(true);
  expect(json.code).toBe(code);
  expect(json.requestId).toBe(res.headers.get("x-request-id"));
  return json;
}

describe("defineRoute", () => {
  it("returns the success envelope with no-store and a request id", async () => {
    const res = await makeRoute()(request({ name: "  Ama  " }), params());
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toMatch(/^req_/);
    expect(await res.json()).toEqual({ id: `${THING}:${USER_ID}`, name: "Ama" });
  });

  it("rejects missing or bad tokens with 401 before touching the body", async () => {
    await expectError(
      await makeRoute()(request({ name: "x" }, { authorization: "" }), params()),
      401,
      "unauthorized",
    );
    await expectError(
      await makeRoute()(request({ name: "x" }, { authorization: "Bearer tampered" }), params()),
      401,
      "unauthorized",
    );
  });

  it("rejects unknown fields and reports paths without echoing values", async () => {
    const res = await makeRoute()(request({ name: "ok", isAdmin: "SECRET_VALUE" }), params());
    const json = await expectError(res, 400, "bad_request");
    expect(json.details).toEqual([{ path: "body.isAdmin", issue: "unrecognized_keys" }]);
    expect(JSON.stringify(json)).not.toContain("SECRET_VALUE");
  });

  it("validates params", async () => {
    await expectError(await makeRoute()(request({ name: "ok" }), params("../../etc")), 400, "bad_request");
  });

  it("rejects unexpected query parameters", async () => {
    const req = new Request(`http://localhost/api/things/${THING}?debug=1`, {
      method: "POST",
      headers: { authorization: "Bearer good", "content-type": "application/json" },
      body: JSON.stringify({ name: "ok" }),
    });
    await expectError(await makeRoute()(req, params()), 400, "bad_request");
  });

  it("rejects invalid JSON, wrong content type, and oversized bodies", async () => {
    await expectError(await makeRoute()(request(null, {}, "{not json"), params()), 400, "bad_request");
    await expectError(
      await makeRoute()(request({ name: "ok" }, { "content-type": "text/plain" }), params()),
      415,
      "unsupported_media",
    );
    await expectError(
      await makeRoute()(request({ name: "x".repeat(1000) }), params()),
      413,
      "payload_too_large",
    );
  });

  it("enforces the body cap even when content-length lies", async () => {
    const big = JSON.stringify({ name: "x".repeat(1000) });
    await expectError(
      await makeRoute()(request(null, { "content-length": "5" }, big), params()),
      413,
      "payload_too_large",
    );
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const route = defineRoute(
      contract,
      async () => {
        throw new Error("db password is hunter2");
      },
      { authenticate: fakeAuth, rateLimiter: new MemoryRateLimiter() },
    );
    const json = await expectError(await route(request({ name: "ok" }), params()), 500, "internal");
    expect(JSON.stringify(json)).not.toContain("hunter2");
  });

  it("rate limits per user with Retry-After", async () => {
    process.env.RATE_LIMIT_USER_PER_MINUTE = "2";
    const { resetConfigCache } = await import("@/lib/config/env");
    resetConfigCache();
    try {
      const route = makeRoute({ limiter: new MemoryRateLimiter() });
      expect((await route(request({ name: "a" }), params())).status).toBe(201);
      expect((await route(request({ name: "b" }), params())).status).toBe(201);
      const res = await route(request({ name: "c" }), params());
      const json = await expectError(res, 429, "rate_limited");
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(json.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      delete process.env.RATE_LIMIT_USER_PER_MINUTE;
      resetConfigCache();
    }
  });
});

describe("cron auth", () => {
  const cron = {
    method: "GET",
    path: "/api/internal/x",
    summary: "t",
    tag: "t",
    auth: "cron",
    phase: 0,
    success: { status: 200, schema: z.strictObject({ ok: z.boolean() }) },
    errors: [],
  } as const satisfies RouteContract;
  const route = defineRoute(cron, async () => ({ data: { ok: true } }));
  const call = (auth?: string) =>
    route(new Request("http://localhost/api/internal/x", { headers: auth ? { authorization: auth } : {} }));

  it("accepts only the exact secret", async () => {
    expect((await call(`Bearer ${process.env.CRON_SECRET}`)).status).toBe(200);
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call(`Bearer ${process.env.CRON_SECRET}x`)).status).toBe(401);
  });
});
