import { z } from "zod";
import { ApiError } from "@/lib/http/errors";
import { log } from "@/lib/log/logger";

export interface City {
  id: number;
  name: string;
  admin1: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface Geocoder {
  search(query: string): Promise<City[]>;
  getById(id: number): Promise<City | null>;
}

const resultSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  admin1: z.string().max(200).optional(),
  country: z.string().min(1).max(200),
  country_code: z.string().length(2),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1).max(64),
});

const searchSchema = z.object({ results: z.array(z.unknown()).optional() });

const BASE = "https://geocoding-api.open-meteo.com/v1";
const TIMEOUT_MS = 5_000;

function toCity(raw: unknown): City | null {
  const r = resultSchema.safeParse(raw);
  if (!r.success) return null;
  if (!isValidTimezone(r.data.timezone)) return null;
  return {
    id: r.data.id,
    name: r.data.name,
    admin1: r.data.admin1 ?? null,
    country: r.data.country,
    countryCode: r.data.country_code.toUpperCase(),
    latitude: r.data.latitude,
    longitude: r.data.longitude,
    timezone: r.data.timezone,
  };
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Open-Meteo geocoding (free, no key). Only the city name the user typed is sent. Responses are
 * validated; malformed results are dropped.
 */
export class OpenMeteoGeocoder implements Geocoder {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private async get(url: URL): Promise<unknown | null> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "application/json" },
      });
    } catch {
      log.warn("geocode.unavailable", { reason: "network" });
      throw new ApiError("provider_unavailable");
    }
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) {
      log.warn("geocode.unavailable", { status: res.status });
      throw new ApiError("provider_unavailable");
    }
    return res.json().catch(() => null);
  }

  async search(query: string): Promise<City[]> {
    const url = new URL(`${BASE}/search`);
    url.searchParams.set("name", query);
    url.searchParams.set("count", "10");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const body = searchSchema.safeParse(await this.get(url));
    if (!body.success) return [];
    return (body.data.results ?? []).map(toCity).filter((c): c is City => c !== null);
  }

  async getById(id: number): Promise<City | null> {
    const url = new URL(`${BASE}/get`);
    url.searchParams.set("id", String(id));
    return toCity(await this.get(url));
  }
}

let geocoder: Geocoder | undefined;

export function getGeocoder(): Geocoder {
  geocoder ??= new OpenMeteoGeocoder();
  return geocoder;
}

/** Test hook: replace the geocoder. */
export function setGeocoder(g: Geocoder | undefined): void {
  geocoder = g;
}
