import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { drawPanel } from "@/lib/pages/generate";

export const maxDuration = 60;

export const POST = defineRoute(routes.drawPanel, async ({ user, params, body, requestId }) => ({
  data: { panel: await drawPanel(params.pageId, params.index, user.id, body.regenerate, requestId) },
}));
