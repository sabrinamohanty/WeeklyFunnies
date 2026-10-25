import { z } from "zod";

export const uuid = z.uuid();
export const timestamp = z.iso.datetime({ offset: true }).meta({ description: "ISO 8601 timestamp." });
export const isoDate = z.iso.date().meta({ description: "Calendar date, YYYY-MM-DD." });
export const signedUrl = z
  .url()
  .meta({ description: "Short-lived signed URL. Do not cache past urlsExpireAt." });

export const ZODIAC_SIGNS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;
export const zodiacSignSchema = z.enum(ZODIAC_SIGNS).meta({ id: "ZodiacSign" });
export type ZodiacSign = z.infer<typeof zodiacSignSchema>;

export const roleSchema = z.enum(["owner", "member"]).meta({ id: "Role" });

/** Wraps a success payload in the standard `{ data }` envelope. */
export function dataEnvelope<T extends z.ZodType>(schema: T) {
  return z.strictObject({ data: schema });
}

export const emptyBody = z.strictObject({});

export const deletedSchema = z.strictObject({ id: uuid, deleted: z.literal(true) }).meta({ id: "Deleted" });
