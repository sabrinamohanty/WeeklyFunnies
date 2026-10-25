import { describe, expect, it } from "vitest";
import { sanitizeFields } from "@/lib/log/logger";

describe("sanitizeFields", () => {
  it("redacts fields that could carry user content or credentials", () => {
    const out = sanitizeFields({
      sourceText: "my secret diary",
      prompt: "draw me",
      authorization: "Bearer abc",
      email: "a@b.c",
      storagePath: "photos/p/u/x",
      signedUrl: "https://x",
      selfie: "bytes",
      name: "Ama",
    });
    for (const v of Object.values(out)) expect(v).toBe("[redacted]");
  });

  it("keeps metadata like ids, statuses, timings, and counts", () => {
    const out = sanitizeFields({
      requestId: "req_1",
      routeId: "GET /api/health",
      userId: "u1",
      photoId: "p1",
      status: 200,
      durationMs: 12,
      photoCount: 3,
      errorName: "TypeError",
    });
    expect(out).toEqual({
      requestId: "req_1",
      routeId: "GET /api/health",
      userId: "u1",
      photoId: "p1",
      status: 200,
      durationMs: 12,
      photoCount: 3,
      errorName: "TypeError",
    });
  });

  it("truncates long strings and drops undefined", () => {
    const out = sanitizeFields({ jobId: "j".repeat(500), userId: undefined });
    expect(String(out.jobId).length).toBeLessThan(230);
    expect("userId" in out).toBe(false);
  });
});
