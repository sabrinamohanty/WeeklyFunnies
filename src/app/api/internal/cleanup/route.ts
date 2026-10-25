import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { runCleanup } from "@/lib/retention/cleanup";

export const GET = defineRoute(routes.runCleanup, async () => ({
  data: { processed: await runCleanup() },
}));
