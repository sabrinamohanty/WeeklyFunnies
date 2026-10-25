import { ZODIAC_SIGNS, type ZodiacSign } from "@/lib/contract/common";
import { getAiService } from "@/lib/ai";
import { serviceDb } from "@/lib/db/client";
import { dbError, unwrap } from "@/lib/db/errors";
import { luckyNumber } from "@/lib/editions/lucky";
import { log } from "@/lib/log/logger";
import { fallbackHoroscope } from "@/lib/safety/fallback";

const TEXT_MAX = 600;

export interface EditionHoroscope {
  sign: ZodiacSign;
  text: string;
  luckyNumber: number;
  userIds: string[];
}

function isSign(value: string | null): value is ZodiacSign {
  return value !== null && (ZODIAC_SIGNS as readonly string[]).includes(value);
}

async function writeHoroscope(sign: ZodiacSign, weekStart: string): Promise<string> {
  try {
    const text = (
      await getAiService().generateHoroscope(
        { sign, weekStart },
        { requestId: `horoscope:${weekStart}:${sign}` },
      )
    ).trim();
    if (text) return text.slice(0, TEXT_MAX);
  } catch (err) {
    log.warn("horoscope.fallback", { sign, errorName: err instanceof Error ? err.name : "error" });
  }
  return fallbackHoroscope(sign);
}

/**
 * One horoscope per sign on the paper, shared by every paper on that Monday.
 * Missing rows are written here. A second reader in the same week reuses them.
 */
export async function horoscopesFor(
  weekStart: string,
  members: { userId: string; zodiacSign: string | null }[],
): Promise<EditionHoroscope[]> {
  const signs = [...new Set(members.map((m) => m.zodiacSign).filter(isSign))];
  if (!signs.length) return [];

  const existing = new Set(
    unwrap(
      await serviceDb().from("horoscopes").select("sign").eq("week_start", weekStart).in("sign", signs),
    ).map((row) => row.sign),
  );
  for (const sign of signs) {
    if (existing.has(sign)) continue;
    const inserted = await serviceDb()
      .from("horoscopes")
      .insert({ sign, week_start: weekStart, text: await writeHoroscope(sign, weekStart) });
    if (inserted.error && inserted.error.code !== "23505") throw dbError(inserted.error);
  }

  const rows = unwrap(
    await serviceDb().from("horoscopes").select("sign, text").eq("week_start", weekStart).in("sign", signs),
  );
  const bySign = new Map(rows.map((row) => [row.sign, row.text]));
  const horoscopes: EditionHoroscope[] = [];
  for (const sign of signs) {
    const text = bySign.get(sign);
    if (!text) continue;
    horoscopes.push({
      sign,
      text,
      luckyNumber: luckyNumber(sign, weekStart),
      userIds: members.filter((m) => m.zodiacSign === sign).map((m) => m.userId),
    });
  }
  return horoscopes;
}
