import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import type { ErrorEnvelope } from "@/lib/contract/errors";
import { proxy } from "@/proxy";

const call = (method: string, path: string) => proxy(new NextRequest(`http://localhost${path}`, { method }));

describe("proxy", () => {
  it("passes through known method and path pairs", () => {
    expect(call("GET", "/api/health").headers.get("x-middleware-next")).toBe("1");
    expect(
      call("PATCH", "/api/events/0b6f9a52-3c1d-4e8f-a2b7-5d9c0e1f2a3b").headers.get("x-middleware-next"),
    ).toBe("1");
  });

  it("answers unknown paths with a JSON 404 envelope", async () => {
    const res = call("GET", "/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("not_found");
  });

  it("answers unsupported methods with a JSON 405 and an Allow header", async () => {
    const res = call("DELETE", "/api/health");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("method_not_allowed");
  });

  it("does not let path segments span slashes", () => {
    expect(call("GET", "/api/editions/a/b").status).toBe(404);
  });
});
