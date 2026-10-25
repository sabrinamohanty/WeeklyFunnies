import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { deleteHighlight, getAuthorHighlight, updateHighlight } from "@/lib/pages/repo";

export const GET = defineRoute(routes.getHighlight, async ({ user, params }) => ({
  data: { highlight: await getAuthorHighlight(params.highlightId, user.id) },
}));

export const PATCH = defineRoute(routes.updateHighlight, async ({ user, params, body, requestId }) => ({
  data: { highlight: await updateHighlight(params.highlightId, user.id, body, requestId) },
}));

export const DELETE = defineRoute(routes.deleteHighlight, async ({ user, params }) => {
  await deleteHighlight(params.highlightId, user.id);
  return { data: { id: params.highlightId, deleted: true as const } };
});
