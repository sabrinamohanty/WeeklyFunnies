import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { reorderPanels } from "@/lib/pages/generate";

export const PUT = defineRoute(routes.reorderPanels, async ({ user, params, body }) => ({
  data: { page: await reorderPanels(params.pageId, user.id, body.order) },
}));
