import { describe, expect, it } from "vitest";
import { editionIsKept } from "@/lib/retention/cleanup";

const now = new Date("2026-10-25T12:00:00.000Z");

describe("editionIsKept", () => {
  it("keeps a saved published edition", () => {
    expect(editionIsKept({ status: "published", saved_at: now.toISOString(), expires_at: null }, now)).toBe(
      true,
    );
  });

  it("keeps a published edition that has not expired", () => {
    expect(
      editionIsKept({ status: "published", saved_at: null, expires_at: "2026-11-08T12:00:00.000Z" }, now),
    ).toBe(true);
  });

  it("drops a published edition past its expiry", () => {
    expect(
      editionIsKept({ status: "published", saved_at: null, expires_at: "2026-10-24T12:00:00.000Z" }, now),
    ).toBe(false);
  });

  it("does not keep a draft", () => {
    expect(editionIsKept({ status: "draft", saved_at: null, expires_at: null }, now)).toBe(false);
  });
});
