import { z } from "zod";
import { isoDate } from "@/lib/contract/common";
import { isValidTimezone } from "@/lib/geo/geocode";
import { ApiError } from "@/lib/http/errors";
import { log } from "@/lib/log/logger";
import { weatherSummary } from "./codes";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 5_000;

export interface ForecastConditions {
  tempC: number;
  weatherCode: number;
  summary: string;
}

export interface ForecastDay {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationChance: number | null;
  weatherCode: number;
  summary: string;
}

export interface Forecast {
  timezone: string;
  current: ForecastConditions | null;
  days: ForecastDay[];
}

export interface ForecastClient {
  forecast(lat: number, lon: number): Promise<Forecast>;
}

/** About 11 km of latitude, and a similar span of longitude away from the poles. */
export function roundAbout10km(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const currentSchema = z.object({
  temperature_2m: z.number(),
  weather_code: z.number(),
});

const dailySchema = z.object({
  time: z.array(z.string()),
  weather_code: z.array(z.number()),
  temperature_2m_max: z.array(z.number()),
  temperature_2m_min: z.array(z.number()),
  precipitation_probability_max: z.array(z.number().nullable()),
});

const bodySchema = z.object({
  timezone: z.string(),
  current: currentSchema.optional(),
  daily: dailySchema.optional(),
});

function oneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function chance(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function codeOf(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const code = Math.round(n);
  if (code < 0 || code > 99) return null;
  return code;
}

/** Turns an Open-Meteo body into a forecast. Returns null when the body is unusable. */
export function parseForecast(raw: unknown): Forecast | null {
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success || !isValidTimezone(parsed.data.timezone)) return null;

  const currentCode = parsed.data.current ? codeOf(parsed.data.current.weather_code) : null;
  const current =
    parsed.data.current && currentCode !== null
      ? {
          tempC: oneDecimal(parsed.data.current.temperature_2m),
          weatherCode: currentCode,
          summary: weatherSummary(currentCode),
        }
      : null;

  const daily = parsed.data.daily;
  const days: ForecastDay[] = [];
  if (daily) {
    const count = Math.min(
      7,
      daily.time.length,
      daily.weather_code.length,
      daily.temperature_2m_max.length,
      daily.temperature_2m_min.length,
      daily.precipitation_probability_max.length,
    );
    for (let i = 0; i < count; i++) {
      const date = isoDate.safeParse(daily.time[i]);
      const weatherCode = codeOf(daily.weather_code[i]!);
      const max = daily.temperature_2m_max[i]!;
      const min = daily.temperature_2m_min[i]!;
      if (!date.success || weatherCode === null || !Number.isFinite(max) || !Number.isFinite(min)) continue;
      days.push({
        date: date.data,
        tempMaxC: oneDecimal(max),
        tempMinC: oneDecimal(min),
        precipitationChance: chance(daily.precipitation_probability_max[i]),
        weatherCode,
        summary: weatherSummary(weatherCode),
      });
    }
  }

  return { timezone: parsed.data.timezone, current, days };
}

export class OpenMeteoForecast implements ForecastClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async forecast(lat: number, lon: number): Promise<Forecast> {
    const url = new URL(FORECAST_URL);
    url.searchParams.set("latitude", String(roundAbout10km(lat)));
    url.searchParams.set("longitude", String(roundAbout10km(lon)));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    );
    url.searchParams.set("forecast_days", "7");
    url.searchParams.set("timezone", "auto");

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "application/json" },
      });
    } catch {
      log.warn("weather.unavailable", { reason: "network" });
      throw new ApiError("provider_unavailable");
    }
    if (!res.ok) {
      log.warn("weather.unavailable", { status: res.status });
      throw new ApiError("provider_unavailable");
    }
    const forecast = parseForecast(await res.json().catch(() => null));
    if (!forecast) {
      log.warn("weather.unavailable", { reason: "invalid_body" });
      throw new ApiError("provider_unavailable");
    }
    return forecast;
  }
}

let client: ForecastClient | undefined;

export function getForecastClient(): ForecastClient {
  client ??= new OpenMeteoForecast();
  return client;
}

/** Test hook: replace the forecast client. */
export function setForecastClient(next: ForecastClient | undefined): void {
  client = next;
}
