import { routes } from "@/lib/contract/routes";
import { getGeocoder } from "@/lib/geo/geocode";
import { defineRoute } from "@/lib/http/handler";

export const GET = defineRoute(routes.geocode, async ({ query }) => ({
  data: { results: await getGeocoder().search(query.q) },
}));
