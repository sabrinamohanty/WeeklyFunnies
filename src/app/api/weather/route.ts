import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { loadWeather } from "@/lib/weather/load";

export const GET = defineRoute(routes.getWeather, async ({ user, query }) => ({
  data: { weather: await loadWeather(user.id, query) },
}));
