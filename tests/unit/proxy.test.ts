import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { resetConfigCache } from "@/lib/config/env";
import type { ErrorEnvelope } from "@/lib/contract/errors";
import { proxy } from "@/proxy";

const ID = "0b6f9a52-3c1d-4e8f-a2b7-5d9c0e1f2a3b";
const call = (method: string, path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`http://localhost${path}`, { method, headers }));

afterEach(() => {
  delete process.env.CORS_ALLOWED_ORIGINS;
  resetConfigCache();
});

function allow(origins: string) {
  process.env.CORS_ALLOWED_ORIGINS = origins;
  resetConfigCache();
}

describe("proxy", () => {
  it("passes through known method and path pairs", () => {
    expect(call("GET", "/api/health").headers.get("x-middleware-next")).toBe("1");
    expect(call("PATCH", `/api/highlights/${ID}`).headers.get("x-middleware-next")).toBe("1");
    expect(call("POST", `/api/pages/${ID}/panels/2`).headers.get("x-middleware-next")).toBe("1");
    expect(call("PUT", "/api/pages/current").headers.get("x-middleware-next")).toBe("1");
    expect(call("GET", "/api/weather").headers.get("x-middleware-next")).toBe("1");
    expect(call("POST", "/api/panel").status).toBe(404);
    expect(call("POST", "/api/story").status).toBe(404);
  });

  it("answers unknown paths with a JSON 404 envelope", async () => {
    const res = call("GET", "/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).code).toBe("not_found");
    expect(call("GET", `/api/events/${ID}`).status).toBe(404);
    expect(call("POST", `/api/editions/${ID}/panels/2`).status).toBe(404);
  });

  it("answers unsupported methods with a JSON 405 and an Allow header", async () => {
    const res = call("DELETE", "/api/health");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
    expect(((await res.json()) as ErrorEnvelope).code).toBe("method_not_allowed");
  });

  it("does not let path segments span slashes", () => {
    expect(call("GET", "/api/editions/a/b").status).toBe(404);
  });
});

describe("CORS", () => {
  const preflight = (origin: string, method = "POST", path = `/api/pages/${ID}/highlights`) =>
    call("OPTIONS", path, { origin, "access-control-request-method": method });

  it("sends no CORS headers when no origins are configured", () => {
    const res = preflight("http://localhost:3000");
    expect(res.status).toBe(405);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers preflight for an allowed origin with that origin only", () => {
    allow("http://localhost:3000, https://app.example.com");
    const res = preflight("http://localhost:3000");
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST");
    expect(res.headers.get("access-control-allow-headers")).toBe("authorization, content-type");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("rejects preflight from other origins and for undeclared methods", () => {
    allow("http://localhost:3000");
    for (const origin of ["http://evil.example", "http://localhost:3000.evil.example", "null"]) {
      const res = preflight(origin);
      expect(res.status, origin).toBe(405);
      expect(res.headers.get("access-control-allow-origin"), origin).toBeNull();
    }
    expect(preflight("http://localhost:3000", "DELETE").status).toBe(405);
  });

  it("adds CORS headers to passed-through requests and error envelopes for allowed origins", () => {
    allow("http://localhost:3000");
    const ok = call("GET", "/api/health", { origin: "http://localhost:3000" });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(ok.headers.get("access-control-expose-headers")).toContain("x-request-id");
    const missing = call("GET", "/api/nope", { origin: "http://localhost:3000" });
    expect(missing.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const other = call("GET", "/api/health", { origin: "http://evil.example" });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});
