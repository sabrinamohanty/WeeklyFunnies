import { describe, expect, it } from "vitest";
import { joinRequestSchema } from "@/lib/contract/papers";
import { generateInviteCode, hashInviteCode } from "@/lib/papers/invite-code";

describe("invite codes", () => {
  it("are 6 Crockford base32 characters and rarely repeat", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 1_000; i++) {
      const c = generateInviteCode();
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
      codes.add(c);
    }
    // 1,000 draws from 2^30 codes: a repeat is possible but very unlikely.
    expect(codes.size).toBeGreaterThanOrEqual(998);
  });

  it("parse back however the user types them", () => {
    const code = generateInviteCode();
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    for (const typed of [code, code.toLowerCase(), ` ${spaced} `, `${code.slice(0, 3)}-${code.slice(3)}`]) {
      const parsed = joinRequestSchema.safeParse({ code: typed });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.code).toBe(code);
    }
  });

  it("read O as 0 and I or L as 1, so look-alike letters still work", () => {
    expect(joinRequestSchema.parse({ code: "B00KC1" }).code).toBe("B00KC1");
    expect(joinRequestSchema.parse({ code: "bookcl" }).code).toBe("B00KC1");
    expect(joinRequestSchema.parse({ code: "BOOKCI" }).code).toBe("B00KC1");
  });

  it("reject malformed input", () => {
    for (const code of ["", "SHORT", "UUUUUU", "AAAAAAA", "'; drop table invites;--", "x".repeat(40)]) {
      expect(joinRequestSchema.safeParse({ code }).success, code).toBe(false);
    }
  });

  it("hash with a pepper, so stored hashes are useless without the server secret", () => {
    const code = generateInviteCode();
    const a = hashInviteCode(code, "pepper-one-0123456789abcdef0123456");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteCode(code, "pepper-one-0123456789abcdef0123456")).toBe(a);
    expect(hashInviteCode(code, "pepper-two-0123456789abcdef0123456")).not.toBe(a);
  });
});
