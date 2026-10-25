import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";

export const GET = defineRoute(routes.health, async () => ({ data: { status: "ok" as const } }));
