import { z } from "zod";
import { isoDate, timestamp } from "./common";

const coordinate = (min: number, max: number) =>
  z
    .string()
    .max(20)
    .regex(/^-?\d{1,3}(\.\d+)?$/, "Invalid coordinate")
    .transform(Number)
    .pipe(z.number().min(min).max(max));

export const weatherQuerySchema = z
  .strictObject({
    lat: coordinate(-90, 90).optional(),
    lon: coordinate(-180, 180).optional(),
  })
  .refine((q) => (q.lat === undefined) === (q.lon === undefined), {
    message: "Send both lat and lon, or neither",
  })
  .meta({
    description:
      "Browser location, if the reader allowed it. Rounded to about 10 km on arrival and never stored or " +
      "logged. Without it, the reader's profile city is used.",
  });

const dayCode = z.number().int().meta({ description: "WMO weather interpretation code." });

export const weatherSchema = z
  .strictObject({
    source: z.enum(["location", "profile_city"]),
    place: z.string().nullable().meta({
      description: "The profile city's name. Null for browser location; label it on the client.",
    }),
    timezone: z.string(),
    fetchedAt: timestamp,
    current: z.strictObject({ tempC: z.number(), weatherCode: dayCode, summary: z.string() }).nullable(),
    days: z
      .array(
        z.strictObject({
          date: isoDate,
          tempMaxC: z.number(),
          tempMinC: z.number(),
          precipitationChance: z.number().int().min(0).max(100).nullable(),
          weatherCode: dayCode,
          summary: z.string().meta({ description: "Short label for the code, e.g. 'Light rain'." }),
        }),
      )
      .max(7),
  })
  .meta({ id: "Weather", description: "Today plus the next six days, from Open-Meteo." });

export const weatherResponseSchema = z.strictObject({
  weather: weatherSchema
    .nullable()
    .meta({ description: "Null when there's no location and no profile city." }),
});
