import { routes } from "@/lib/contract/routes";
import { failStuckPanels } from "@/lib/editions/repo";
import { defineRoute } from "@/lib/http/handler";

export const GET = defineRoute(routes.runJobs, async () => ({
  data: { processed: await failStuckPanels() },
}));
