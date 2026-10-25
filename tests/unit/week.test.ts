import { describe, expect, it } from "vitest";
import { addCalendarDays, deadlineOf, mondayOf, sundayOf, zonedInstant, zonedParts } from "@/lib/time/week";

describe("week helpers", () => {
  it("finds Monday in the caller's timezone, including around midnight", () => {
    // Saturday afternoon UTC is still Saturday in Chicago.
    expect(mondayOf(new Date("2026-10-24T15:00:00Z"), "America/Chicago")).toBe("2026-10-19");
    expect(mondayOf(new Date("2026-10-24T15:00:00Z"), "Africa/Accra")).toBe("2026-10-19");
    // 04:00 UTC Monday is still Sunday evening in Chicago (CDT, UTC-5).
    expect(mondayOf(new Date("2026-10-26T04:00:00Z"), "America/Chicago")).toBe("2026-10-19");
    expect(mondayOf(new Date("2026-10-26T05:00:00Z"), "America/Chicago")).toBe("2026-10-26");
    expect(mondayOf(new Date("2026-10-26T00:00:00Z"), "Africa/Accra")).toBe("2026-10-26");
  });

  it("returns Sunday of that week", () => {
    expect(sundayOf("2026-10-19")).toBe("2026-10-25");
    expect(addCalendarDays("2026-12-28", 6)).toBe("2027-01-03");
  });

  it("places the deadline at Sunday 11:59:59.999 in the owner's timezone", () => {
    const chicago = deadlineOf("2026-10-19", "America/Chicago");
    expect(chicago.toISOString()).toBe("2026-10-26T04:59:59.999Z");
    const accra = deadlineOf("2026-10-19", "Africa/Accra");
    expect(accra.toISOString()).toBe("2026-10-25T23:59:59.999Z");
    const auckland = deadlineOf("2026-10-19", "Pacific/Auckland");
    expect(zonedParts(auckland, "Pacific/Auckland")).toMatchObject({
      year: 2026,
      month: 10,
      day: 25,
      hour: 23,
      minute: 59,
      second: 59,
    });
  });

  it("resolves a civil time that exists after a DST fallback", () => {
    // 2026-11-01 01:30 in Chicago is ambiguous; the helper still returns a real instant.
    const at = zonedInstant("2026-11-01", 1, 30, 0, 0, "America/Chicago");
    expect(Number.isNaN(at.getTime())).toBe(false);
    expect(zonedParts(at, "America/Chicago")).toMatchObject({ hour: 1, minute: 30 });
  });
});
