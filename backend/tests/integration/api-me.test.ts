import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getMe, PATCH as patchMe } from "@/app/api/me/route";
import { GET as geocode } from "@/app/api/geocode/route";
import { routes } from "@/lib/contract/routes";
import { updateProfileRequestSchema } from "@/lib/contract/profile";
import { DEFAULT_JSON_MAX_BYTES } from "@/lib/http/body";
import { type City, setGeocoder } from "@/lib/geo/geocode";
import { textCases } from "../fixtures/text-cases";
import { call, expectError, expectOk } from "./helpers/api";
import { type TestUser, createUser, deleteUsers, serviceClient } from "./helpers/db";

const KUMASI: City = {
  id: 2298890,
  name: "Kumasi",
  admin1: "Ashanti",
  country: "Ghana",
  countryCode: "GH",
  latitude: 6.68848,
  longitude: -1.62443,
  timezone: "Africa/Accra",
};

let ama: TestUser;
const users: TestUser[] = [];

beforeAll(async () => {
  setGeocoder({
    search: async (q) => (q.toLowerCase().startsWith("ku") ? [KUMASI] : []),
    getById: async (id) => (id === KUMASI.id ? KUMASI : null),
  });
  ama = await createUser("ama");
  users.push(ama);
});

afterAll(async () => {
  setGeocoder(undefined);
  await deleteUsers(users);
});

describe("authentication", () => {
  it("rejects missing, malformed, and tampered tokens with the same 401", async () => {
    await expectError(await call(getMe, { method: "GET", path: "/api/me" }), 401, "unauthorized");
    await expectError(
      await call(getMe, { method: "GET", path: "/api/me", token: "not-a-jwt" }),
      401,
      "unauthorized",
    );
    const [h, p, s] = ama.token.split(".");
    const flipped = `${s!.slice(0, -2)}${s!.endsWith("AA") ? "BB" : "AA"}`;
    await expectError(
      await call(getMe, { method: "GET", path: "/api/me", token: `${h}.${p}.${flipped}` }),
      401,
      "unauthorized",
    );
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000", role: "authenticated" }),
    ).toString("base64url");
    await expectError(
      await call(getMe, { method: "GET", path: "/api/me", token: `${h}.${forgedPayload}.${s}` }),
      401,
      "unauthorized",
    );
  });

  it("rejects tokens of deleted users", async () => {
    const gone = await createUser("gone");
    await serviceClient().auth.admin.deleteUser(gone.id);
    await expectError(
      await call(getMe, { method: "GET", path: "/api/me", token: gone.token }),
      401,
      "unauthorized",
    );
  });
});

describe("GET/PATCH /api/me", () => {
  it("starts empty and not onboarded", async () => {
    const { profile } = await expectOk(
      await call(getMe, { method: "GET", path: "/api/me", token: ama.token }),
      routes.getMe,
    );
    expect(profile).toMatchObject({
      id: ama.id,
      name: null,
      city: null,
      birthday: null,
      zodiacSign: null,
      onboarded: false,
      look: null,
      avatars: [],
    });
    expect(profile).not.toHaveProperty("avatarUrl");
  });

  it("sets name and birthday, deriving the zodiac sign", async () => {
    const res = await call(patchMe, {
      method: "PATCH",
      path: "/api/me",
      token: ama.token,
      body: { name: "  Ama  ", birthday: "1994-03-21" },
    });
    const { profile } = await expectOk(res, routes.updateMe);
    expect(profile).toMatchObject({
      name: "Ama",
      birthday: "1994-03-21",
      zodiacSign: "aries",
      onboarded: false,
    });

    const again = await call(patchMe, {
      method: "PATCH",
      path: "/api/me",
      token: ama.token,
      body: { birthday: "1994-03-20" },
    });
    expect((await expectOk(again, routes.updateMe)).profile).toMatchObject({
      name: "Ama",
      zodiacSign: "pisces",
    });
  });

  it("resolves the city server-side and never returns coordinates", async () => {
    const res = await call(patchMe, {
      method: "PATCH",
      path: "/api/me",
      token: ama.token,
      body: { cityId: KUMASI.id },
    });
    const text = await res.clone().text();
    const { profile } = await expectOk(res, routes.updateMe);
    expect(profile.city).toEqual({
      name: "Kumasi",
      admin1: "Ashanti",
      country: "Ghana",
      timezone: "Africa/Accra",
    });
    expect(text).not.toMatch(/latitude|longitude|6\.688/);

    const { data } = await serviceClient()
      .from("profiles")
      .select("lat, lng, timezone")
      .eq("id", ama.id)
      .single();
    expect(data).toEqual({ lat: KUMASI.latitude, lng: KUMASI.longitude, timezone: "Africa/Accra" });
  });

  it("rejects unknown city ids, unknown fields, empty bodies, and bad birthdays", async () => {
    const patch = (body: unknown) =>
      call(patchMe, { method: "PATCH", path: "/api/me", token: ama.token, body });
    await expectError(await patch({ cityId: 1 }), 404, "not_found");
    const unknown = await expectError(await patch({ name: "Ama", latitude: 1 }), 400, "bad_request");
    expect(JSON.stringify(unknown.details)).toContain("latitude");
    await expectError(
      await patch({ city: { name: "Kumasi", timezone: "Africa/Accra" } }),
      400,
      "bad_request",
    );
    await expectError(await patch({}), 400, "bad_request");
    await expectError(await patch({ birthday: "3000-01-01" }), 400, "bad_request");
    await expectError(await patch({ birthday: "1994-02-30" }), 400, "bad_request");
    await expectError(
      await call(patchMe, { method: "PATCH", path: "/api/me", token: ama.token, rawBody: "{not json" }),
      400,
      "bad_request",
    );
  });

  it("handles every shared text case for the name field", async () => {
    for (const tc of textCases) {
      const res = await call(patchMe, {
        method: "PATCH",
        path: "/api/me",
        token: ama.token,
        body: { name: tc.text },
      });
      if (Buffer.byteLength(JSON.stringify({ name: tc.text })) > DEFAULT_JSON_MAX_BYTES) {
        await expectError(res, 413, "payload_too_large");
        continue;
      }
      const expected = updateProfileRequestSchema.safeParse({ name: tc.text });
      if (!expected.success) {
        await expectError(res, 400, "bad_request");
        continue;
      }
      const { profile } = await expectOk(res, routes.updateMe);
      expect(profile.name, tc.id).toBe(expected.data.name);
    }
  });
});

describe("GET /api/geocode", () => {
  it("returns candidates and validates the query", async () => {
    const data = await expectOk(
      await call(geocode, { method: "GET", path: "/api/geocode?q=Kum", token: ama.token }),
      routes.geocode,
    );
    expect(data.results.map((r) => r.id)).toEqual([KUMASI.id]);
    await expectError(
      await call(geocode, { method: "GET", path: "/api/geocode?q=K", token: ama.token }),
      400,
      "bad_request",
    );
    await expectError(
      await call(geocode, { method: "GET", path: "/api/geocode?q=Kum&lat=1", token: ama.token }),
      400,
      "bad_request",
    );
    await expectError(
      await call(geocode, { method: "GET", path: "/api/geocode?q=Kum" }),
      401,
      "unauthorized",
    );
  });
});
