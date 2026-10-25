// Weekly horoscopes for The Weekly Funnies.
// One call writes a short reading for each sign you ask for.
// The server should save each reading per sign per week (so 12 readings a week at most,
// no matter how many friends share a sign).
//
// Needs META_API_KEY in the environment (server side only).

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.META_API_KEY,
  baseURL: "https://api.meta.ai/v1",
});

const TEXT_MODEL = process.env.STORY_MODEL || "muse-spark-1.1";

export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

// The same sign in the same week always gets the same lucky number (1-99)
export function luckyNumber(sign, weekLabel) {
  let h = 0;
  for (const ch of sign + "|" + weekLabel) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return (h % 99) + 1;
}

const SYSTEM = `You write the horoscopes for The Weekly Funnies, a friendly weekly newspaper by a group of friends. Your tone is warm, silly and PG, like a fortune cookie with a wink.

You get a week label and a list of zodiac signs. Write one reading per sign.
Reply with ONLY valid JSON: {"readings":[{"sign":"","text":""}]}

Rules:
- Each reading is 1-2 short sentences, max 30 words.
- Light and playful. Small everyday stuff only: snacks, plans, group chats, naps, errands.
- No predictions about health, money, jobs, romance, or anything scary or serious. Nothing negative or cruel.
- Do not mention real events, real people or dates.
- Make every sign's reading clearly different from the others.
- Use the sign names exactly as given.`;

// Returns [{ sign, text, lucky }] in the order you asked for
export async function writeHoroscopes({ signs = SIGNS, weekLabel }) {
  const wanted = signs.filter((s) => SIGNS.includes(s));
  if (wanted.length === 0) throw new Error("No valid signs");

  const user = "Week: " + weekLabel + "\nSigns: " + wanted.join(", ");

  // The model sometimes returns something unusable, so try twice
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      });
      const raw = response.choices[0].message.content ?? "";
      const data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));

      const bySign = {};
      for (const r of data.readings ?? []) bySign[r.sign] = r.text;
      if (!wanted.every((s) => bySign[s])) throw new Error("A sign was missing from the reply");

      return wanted.map((sign) => ({ sign, text: bySign[sign], lucky: luckyNumber(sign, weekLabel) }));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
