import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { reorderHighlights } from "@/lib/pages/repo";

export const PUT = defineRoute(routes.reorderHighlights, async ({ user, params, body }) => ({
  data: { page: await reorderHighlights(params.pageId, user.id, body.highlightIds) },
}));
