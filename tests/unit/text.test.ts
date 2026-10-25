import { describe, expect, it } from "vitest";
import { cleanText, codePointLength, textField } from "@/lib/contract/text";
import { MAX, textCases } from "../fixtures/text-cases";

const INVISIBLE_OR_CONTROL =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;

describe("textField against the shared text fixture", () => {
  const single = textField({ max: MAX });
  const multi = textField({ max: MAX, mode: "multiline" });

  for (const tc of textCases) {
    it(`${tc.category}/${tc.id} → ${tc.expect}`, () => {
      for (const schema of [single, multi]) {
        const result = schema.safeParse(tc.text);
        expect(result.success, `${tc.id}`).toBe(tc.expect === "accept");
        if (!result.success) continue;

        const out = result.data;
        expect(out).toBe(out.normalize("NFC"));
        expect(out).toBe(out.trim());
        expect(INVISIBLE_OR_CONTROL.test(out)).toBe(false);
        expect(codePointLength(out)).toBeLessThanOrEqual(MAX);
        expect(codePointLength(out)).toBeGreaterThan(0);
        for (const p of tc.preserves ?? []) expect(out).toContain(p);
      }
    });
  }

  it("rejects non-strings", () => {
    for (const v of [null, undefined, 42, {}, [], true]) expect(single.safeParse(v).success).toBe(false);
  });

  it("rejects a 100k+ input quickly, before cleaning", () => {
    const huge = "a".repeat(150_000);
    const t = performance.now();
    expect(single.safeParse(huge).success).toBe(false);
    expect(performance.now() - t).toBeLessThan(50);
  });
});

describe("cleanText", () => {
  it("collapses all whitespace in single-line mode", () => {
    expect(cleanText("  a\n\tb\r\n  c  ", "single-line")).toBe("a b c");
  });

  it("keeps up to one blank line in multiline mode", () => {
    expect(cleanText("a\r\n\r\n\r\n\r\nb\rc", "multiline")).toBe("a\n\nb\nc");
    expect(cleanText("a  \t b \n  c", "multiline")).toBe("a b\nc");
  });

  it("keeps ZWJ and ZWNJ, which emoji and some scripts need", () => {
    expect(cleanText("👨‍👩‍👧", "single-line")).toBe("👨‍👩‍👧");
    expect(cleanText("می\u200Cخواهم", "single-line")).toBe("می\u200Cخواهم");
  });

  it("strips direction overrides used for spoofing", () => {
    expect(cleanText("invoice\u202Etxt.exe", "single-line")).toBe("invoicetxt.exe");
  });

  it("counts code points, not UTF-16 units", () => {
    expect(codePointLength("🌮🌮")).toBe(2);
    expect("🌮🌮".length).toBe(4);
  });
});
