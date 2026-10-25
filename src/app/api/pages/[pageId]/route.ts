import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { updatePageText } from "@/lib/pages/generate";
import { getAuthorPage } from "@/lib/pages/repo";

export const GET = defineRoute(routes.getPage, async ({ user, params }) => ({
  data: { page: await getAuthorPage(params.pageId, user.id) },
}));

export const PATCH = defineRoute(routes.updatePage, async ({ user, params, body, requestId }) => ({
  data: { page: await updatePageText(params.pageId, user.id, body, requestId) },
}));
