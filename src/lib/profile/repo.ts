import type { z } from "zod";
import type { ZodiacSign } from "@/lib/contract/common";
import type { profileSchema } from "@/lib/contract/profile";
import { serviceDb } from "@/lib/db/client";
import { unwrap, unwrapMaybe } from "@/lib/db/errors";
import type { TablesUpdate } from "@/lib/db/types";
import type { City } from "@/lib/geo/geocode";
import { ApiError } from "@/lib/http/errors";
import { signUrls } from "@/lib/storage/signed";

type Profile = z.input<typeof profileSchema>;

const COLUMNS =
  "id, name, city_name, city_admin1, city_country, timezone, birthday, zodiac_sign, avatar_path, created_at";

export async function getProfile(userId: string): Promise<Profile> {
  const row = unwrapMaybe(await serviceDb().from("profiles").select(COLUMNS).eq("id", userId).maybeSingle());
  if (!row) throw new ApiError("not_found");

  const urls = await signUrls("avatars", [row.avatar_path]);
  return {
    id: row.id,
    name: row.name,
    city:
      row.city_name && row.city_country && row.timezone
        ? { name: row.city_name, admin1: row.city_admin1, country: row.city_country, timezone: row.timezone }
        : null,
    birthday: row.birthday,
    zodiacSign: row.zodiac_sign as ZodiacSign | null,
    avatarUrl: row.avatar_path ? (urls.get(row.avatar_path) ?? null) : null,
    onboarded: Boolean(row.name && row.city_name && row.birthday && row.avatar_path),
    createdAt: row.created_at,
  };
}

export async function updateProfile(
  userId: string,
  changes: { name?: string; city?: City; birthday?: string },
): Promise<void> {
  const update: TablesUpdate<"profiles"> = {};
  if (changes.name !== undefined) update.name = changes.name;
  if (changes.birthday !== undefined) update.birthday = changes.birthday;
  if (changes.city) {
    update.city_name = changes.city.name;
    update.city_admin1 = changes.city.admin1;
    update.city_country = changes.city.country;
    update.city_country_code = changes.city.countryCode;
    update.lat = changes.city.latitude;
    update.lng = changes.city.longitude;
    update.timezone = changes.city.timezone;
  }
  unwrap(await serviceDb().from("profiles").update(update).eq("id", userId).select("id").single());
}
