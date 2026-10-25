import { describe, expect, it } from "vitest";
import type { ErrorEnvelope } from "@/lib/contract/errors";
import { GET as health } from "@/app/api/health/route";
import { GET as getMe } from "@/app/api/me/route";
import { GET as runJobs } from "@/app/api/internal/jobs/route";

describe("Phase 0 routes", () => {
  it("health answers ok", async () => {
    const res = await health(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("user routes answer 401 without a token, before any lookup", async () => {
    const res = await getMe(new Request("http://localhost/api/me"));
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorEnvelope).code).toBe("unauthorized");
  });

  it("cron routes authenticate first", async () => {
    expect((await runJobs(new Request("http://localhost/api/internal/jobs"))).status).toBe(401);
  });
});
