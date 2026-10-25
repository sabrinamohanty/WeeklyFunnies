import { describe, expect, it } from "vitest";
import { OpenMeteoGeocoder } from "@/lib/geo/geocode";
import { ApiError } from "@/lib/http/errors";

const kumasi = {
  id: 2298890,
  name: "Kumasi",
  admin1: "Ashanti",
  country: "Ghana",
  country_code: "GH",
  latitude: 6.68848,
  longitude: -1.62443,
  timezone: "Africa/Accra",
  population: 1468609,
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("OpenMeteoGeocoder", () => {
  it("maps results and sends only the query text", async () => {
    const f = fakeFetch(() => json({ results: [kumasi] }));
    const results = await new OpenMeteoGeocoder(f.impl).search("Kumasi");
    expect(results).toEqual([
      {
        id: 2298890,
        name: "Kumasi",
        admin1: "Ashanti",
        country: "Ghana",
        countryCode: "GH",
        latitude: 6.68848,
        longitude: -1.62443,
        timezone: "Africa/Accra",
      },
    ]);
    expect(f.calls[0]?.hostname).toBe("geocoding-api.open-meteo.com");
    expect([...f.calls[0]!.searchParams.keys()].sort()).toEqual(["count", "format", "language", "name"]);
  });

  it("drops malformed results and unknown timezones", async () => {
    const f = fakeFetch(() =>
      json({
        results: [
          kumasi,
          { ...kumasi, id: 2, latitude: 999 },
          { ...kumasi, id: 3, timezone: "Mars/Olympus_Mons" },
          { ...kumasi, id: 4, name: "" },
          "not an object",
        ],
      }),
    );
    const results = await new OpenMeteoGeocoder(f.impl).search("Kumasi");
    expect(results.map((r) => r.id)).toEqual([2298890]);
  });

  it("returns no results when the response has none", async () => {
    const f = fakeFetch(() => json({ generationtime_ms: 0.5 }));
    expect(await new OpenMeteoGeocoder(f.impl).search("zzzz")).toEqual([]);
  });

  it("resolves by id, and returns null for unknown ids", async () => {
    const f = fakeFetch((url) =>
      url.searchParams.get("id") === "2298890" ? json(kumasi) : json({ error: true }, 400),
    );
    const g = new OpenMeteoGeocoder(f.impl);
    expect((await g.getById(2298890))?.timezone).toBe("Africa/Accra");
    expect(await g.getById(1)).toBeNull();
  });

  it("reports provider outages as provider_unavailable", async () => {
    const down = fakeFetch(() => json({}, 503));
    await expect(new OpenMeteoGeocoder(down.impl).search("x")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    const offline = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const err = await new OpenMeteoGeocoder(offline.impl).search("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("provider_unavailable");
  });
});
