import { describe, expect, it } from "vitest";
import { ZODIAC_SIGNS } from "@/lib/contract/common";
import { luckyNumber } from "@/lib/editions/lucky";

describe("luckyNumber", () => {
  it("is stable per sign and week, and stays in 1 to 99", () => {
    for (const sign of ZODIAC_SIGNS) {
      const n = luckyNumber(sign, "2026-10-19");
      expect(luckyNumber(sign, "2026-10-19")).toBe(n);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99);
    }
  });

  it("varies across signs and weeks", () => {
    const signs = new Set(ZODIAC_SIGNS.map((s) => luckyNumber(s, "2026-10-19")));
    expect(signs.size).toBeGreaterThan(6);
    const weeks = new Set(
      Array.from({ length: 10 }, (_, i) => luckyNumber("leo", `2026-${String(i + 1).padStart(2, "0")}-05`)),
    );
    expect(weeks.size).toBeGreaterThan(5);
  });
});
