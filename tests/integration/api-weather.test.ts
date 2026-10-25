import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getWeather } from "@/app/api/weather/route";
import { routes } from "@/lib/contract/routes";
import { ApiError } from "@/lib/http/errors";
import { setForecastClient, type Forecast } from "@/lib/weather/forecast";
import { call, expectError, expectOk } from "./helpers/api";
import { type TestUser, createUser, deleteUsers, must, serviceClient } from "./helpers/db";

const forecast: Forecast = {
  timezone: "Africa/Accra",
  current: { tempC: 27.4, weatherCode: 2, summary: "Partly cloudy" },
  days: [
    {
      date: "2026-10-25",
      tempMaxC: 31,
      tempMinC: 22,
      precipitationChance: 40,
      weatherCode: 61,
      summary: "Light rain",
    },
  ],
};

const seen: { lat: number; lon: number }[] = [];

let ama: TestUser;
const users: TestUser[] = [];

beforeAll(async () => {
  setForecastClient({
    forecast: async (lat, lon) => {
      seen.push({ lat, lon });
      return forecast;
    },
  });
  ama = await createUser("ama");
  users.push(ama);
});

afterAll(async () => {
  setForecastClient(undefined);
  await deleteUsers(users);
});

describe("GET /api/weather", () => {
  it("is empty until the reader has a city, then uses that city", async () => {
    const { weather: none } = await expectOk(
      await call(getWeather, { method: "GET", path: "/api/weather", token: ama.token }),
      routes.getWeather,
    );
    expect(none).toBeNull();
    expect(seen).toEqual([]);

    must(
      await serviceClient()
        .from("profiles")
        .update({
          city_name: "Kumasi",
          city_admin1: "Ashanti",
          city_country: "Ghana",
          city_country_code: "GH",
          lat: 6.68848,
          lng: -1.62443,
          timezone: "Africa/Accra",
        })
        .eq("id", ama.id)
        .select("id")
        .single(),
    );

    const { weather } = await expectOk(
      await call(getWeather, { method: "GET", path: "/api/weather", token: ama.token }),
      routes.getWeather,
    );
    expect(weather).toMatchObject({
      source: "profile_city",
      place: "Kumasi",
      timezone: "Africa/Accra",
      current: { tempC: 27.4, summary: "Partly cloudy" },
    });
    expect(weather).not.toHaveProperty("lat");
    expect(seen.at(-1)).toEqual({ lat: 6.68848, lon: -1.62443 });
  });

  it("uses the browser location when both coordinates arrive, and rejects a half pair", async () => {
    const { weather } = await expectOk(
      await call(getWeather, {
        method: "GET",
        path: "/api/weather?lat=6.69&lon=-1.62",
        token: ama.token,
      }),
      routes.getWeather,
    );
    expect(weather).toMatchObject({ source: "location", place: null, days: [{ date: "2026-10-25" }] });
    expect(seen.at(-1)).toEqual({ lat: 6.69, lon: -1.62 });

    await expectError(
      await call(getWeather, { method: "GET", path: "/api/weather?lat=6.69", token: ama.token }),
      400,
      "bad_request",
    );
    await expectError(
      await call(getWeather, { method: "GET", path: "/api/weather?lat=91&lon=0", token: ama.token }),
      400,
      "bad_request",
    );
    await expectError(await call(getWeather, { method: "GET", path: "/api/weather" }), 401, "unauthorized");
  });

  it("turns a forecast outage into provider_unavailable", async () => {
    setForecastClient({
      forecast: async () => {
        throw new ApiError("provider_unavailable");
      },
    });
    await expectError(
      await call(getWeather, { method: "GET", path: "/api/weather?lat=0&lon=0", token: ama.token }),
      503,
      "provider_unavailable",
    );
    setForecastClient({
      forecast: async (lat, lon) => {
        seen.push({ lat, lon });
        return forecast;
      },
    });
  });
});
