import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { generatePage } from "@/lib/pages/generate";

export const maxDuration = 60;

export const POST = defineRoute(routes.generatePage, async ({ user, params, body, requestId }) => ({
  data: { page: await generatePage(params.pageId, user.id, body.regenerate, requestId) },
}));
