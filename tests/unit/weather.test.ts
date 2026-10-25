import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { OpenMeteoForecast, parseForecast, roundAbout10km } from "@/lib/weather/forecast";

const body = {
  timezone: "America/Chicago",
  current: { temperature_2m: 21.54, weather_code: 1 },
  daily: {
    time: ["2026-10-25", "2026-10-26", "not-a-date", "2026-10-28"],
    weather_code: [1, 61, 0, 95],
    temperature_2m_max: [28.24, 19.2, 10, 22],
    temperature_2m_min: [16.41, 12, 4, 15],
    precipitation_probability_max: [10.2, null, 0, 140],
  },
};

function fakeFetch(handler: (url: URL) => Response | Promise<Response>) {
  const calls: URL[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

describe("roundAbout10km", () => {
  it("rounds to a tenth of a degree and keeps the poles in range", () => {
    expect(roundAbout10km(30.2672)).toBe(30.3);
    expect(roundAbout10km(-97.7431)).toBe(-97.7);
    expect(roundAbout10km(0.04)).toBe(0);
    expect(roundAbout10km(-0.04)).toBe(0);
    expect(roundAbout10km(89.96)).toBe(90);
    expect(roundAbout10km(-180)).toBe(-180);
  });
});

describe("parseForecast", () => {
  it("keeps today and the valid days, and clamps the chance of rain", () => {
    expect(parseForecast(body)).toEqual({
      timezone: "America/Chicago",
      current: { tempC: 21.5, weatherCode: 1, summary: "Mainly clear" },
      days: [
        {
          date: "2026-10-25",
          tempMaxC: 28.2,
          tempMinC: 16.4,
          precipitationChance: 10,
          weatherCode: 1,
          summary: "Mainly clear",
        },
        {
          date: "2026-10-26",
          tempMaxC: 19.2,
          tempMinC: 12,
          precipitationChance: null,
          weatherCode: 61,
          summary: "Light rain",
        },
        {
          date: "2026-10-28",
          tempMaxC: 22,
          tempMinC: 15,
          precipitationChance: 100,
          weatherCode: 95,
          summary: "Thunderstorm",
        },
      ],
    });
  });

  it("rejects an unknown timezone and a body that is not an object", () => {
    expect(parseForecast({ ...body, timezone: "Mars/Olympus_Mons" })).toBeNull();
    expect(parseForecast(null)).toBeNull();
    expect(parseForecast("sunny")).toBeNull();
  });

  it("returns no current conditions when that block is missing", () => {
    const forecast = parseForecast({ timezone: "UTC", daily: body.daily });
    expect(forecast?.current).toBeNull();
    expect(forecast?.days).toHaveLength(3);
  });
});

describe("OpenMeteoForecast", () => {
  it("asks Open-Meteo with coordinates rounded to about 10 km", async () => {
    const f = fakeFetch(() => json(body));
    const forecast = await new OpenMeteoForecast(f.impl).forecast(30.2672, -97.7431);
    expect(forecast.timezone).toBe("America/Chicago");
    expect(f.calls[0]?.hostname).toBe("api.open-meteo.com");
    expect(f.calls[0]?.searchParams.get("latitude")).toBe("30.3");
    expect(f.calls[0]?.searchParams.get("longitude")).toBe("-97.7");
    expect(f.calls[0]?.href.includes("30.2672")).toBe(false);
    expect(f.calls[0]?.href.includes("-97.7431")).toBe(false);
  });

  it("reports a down or unreadable forecast as provider_unavailable", async () => {
    const down = new OpenMeteoForecast(fakeFetch(() => json({ reason: "nope" }, 503)).impl);
    await expect(down.forecast(1, 1)).rejects.toMatchObject({ code: "provider_unavailable" });

    const garbage = new OpenMeteoForecast(fakeFetch(() => json({ timezone: "Not/AZone" })).impl);
    await expect(garbage.forecast(1, 1)).rejects.toBeInstanceOf(ApiError);

    const offline = new OpenMeteoForecast((async () => {
      throw new Error("offline");
    }) as typeof fetch);
    await expect(offline.forecast(1, 1)).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});
