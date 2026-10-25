const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Calendar date and clock in a timezone, using the platform's IANA database. */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const weekday = WEEKDAY[map.weekday ?? ""];
  if (weekday === undefined) throw new Error("invalid timezone parts");
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Add calendar days to a YYYY-MM-DD date. */
export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + days));
  return ymd(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function mondayOf(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  const daysFromMonday = p.weekday === 0 ? 6 : p.weekday - 1;
  return addCalendarDays(ymd(p.year, p.month, p.day), -daysFromMonday);
}

export function sundayOf(monday: string): string {
  return addCalendarDays(monday, 6);
}

/**
 * Instant of a civil time in `timeZone`. Iterates from a UTC guess so DST transitions
 * (including a skipped or repeated hour) still resolve to a real instant.
 */
export function zonedInstant(
  date: string,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
): Date {
  let guess = Date.parse(`${date}T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(millisecond, 3)}Z`);
  for (let i = 0; i < 8; i++) {
    const shown = zonedParts(new Date(guess), timeZone);
    const shownUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    const wantUtc = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      hour,
      minute,
      second,
    );
    const delta = wantUtc - shownUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

/** Sunday 11:59:59.999 p.m. in the given timezone, for the week starting on `monday`. */
export function deadlineOf(monday: string, timeZone: string): Date {
  return zonedInstant(sundayOf(monday), 23, 59, 59, 999, timeZone);
}

export function isAtOrAfter(instant: Date, now = new Date()): boolean {
  return now.getTime() >= instant.getTime();
}
