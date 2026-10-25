import type { z } from "zod";
import type { weatherSchema } from "@/lib/contract/weather";
import { serviceDb } from "@/lib/db/client";
import { unwrapMaybe } from "@/lib/db/errors";
import { getForecastClient } from "./forecast";

type Weather = z.input<typeof weatherSchema>;

/**
 * Forecast for the browser's location when both coordinates are present, otherwise the profile
 * city. Coordinates are rounded inside the forecast client and are never stored or logged.
 * Returns null when the reader sent no location and has no city.
 */
export async function loadWeather(
  userId: string,
  query: { lat?: number; lon?: number },
  now = new Date(),
): Promise<Weather | null> {
  let lat: number;
  let lon: number;
  let source: Weather["source"];
  let place: string | null;

  if (query.lat !== undefined && query.lon !== undefined) {
    lat = query.lat;
    lon = query.lon;
    source = "location";
    place = null;
  } else {
    const row = unwrapMaybe(
      await serviceDb().from("profiles").select("city_name, lat, lng").eq("id", userId).maybeSingle(),
    );
    if (!row || typeof row.lat !== "number" || typeof row.lng !== "number" || !row.city_name) return null;
    lat = row.lat;
    lon = row.lng;
    source = "profile_city";
    place = row.city_name;
  }

  const forecast = await getForecastClient().forecast(lat, lon);
  return {
    source,
    place,
    timezone: forecast.timezone,
    fetchedAt: now.toISOString(),
    current: forecast.current,
    days: forecast.days,
  };
}
