import { describe, expect, it } from "vitest";
import { joinRequestSchema } from "@/lib/contract/papers";
import { formatInviteCode, generateInviteCode, hashInviteCode } from "@/lib/papers/invite-code";

describe("invite codes", () => {
  it("are 12 Crockford base32 characters and practically never repeat", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const c = generateInviteCode();
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
      codes.add(c);
    }
    expect(codes.size).toBe(10_000);
  });

  it("display as XXXX-XXXX-XXXX and parse back however the user types them", () => {
    const code = generateInviteCode();
    const shown = formatInviteCode(code);
    expect(shown).toMatch(/^.{4}-.{4}-.{4}$/);
    for (const typed of [shown, shown.toLowerCase(), ` ${shown.replace(/-/g, " ")} `, code]) {
      const parsed = joinRequestSchema.safeParse({ code: typed });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.code).toBe(code);
    }
  });

  it("reject malformed input", () => {
    for (const code of [
      "",
      "SHORT",
      "ILOU-ILOU-ILOU",
      "AAAA-AAAA-AAAAA",
      "'; drop table invites;--",
      "x".repeat(40),
    ]) {
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
