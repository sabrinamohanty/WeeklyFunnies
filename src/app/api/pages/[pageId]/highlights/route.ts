import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { addHighlight } from "@/lib/pages/repo";

export const POST = defineRoute(routes.addHighlight, async ({ user, params, body, requestId }) => ({
  data: { highlight: await addHighlight(params.pageId, user.id, body, requestId) },
  status: 201,
}));
