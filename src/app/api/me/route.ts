import { routes } from "@/lib/contract/routes";
import { getGeocoder } from "@/lib/geo/geocode";
import { ApiError } from "@/lib/http/errors";
import { defineRoute } from "@/lib/http/handler";
import { getProfile, updateProfile } from "@/lib/profile/repo";

export const GET = defineRoute(routes.getMe, async ({ user }) => ({
  data: { profile: await getProfile(user.id) },
}));

export const PATCH = defineRoute(routes.updateMe, async ({ user, body }) => {
  let city;
  if (body.cityId !== undefined) {
    // Coordinates and timezone come from the geocoder, never from the client.
    city = await getGeocoder().getById(body.cityId);
    if (!city) throw new ApiError("not_found");
  }
  await updateProfile(user.id, { name: body.name, birthday: body.birthday, style: body.style, city });
  return { data: { profile: await getProfile(user.id) } };
});
