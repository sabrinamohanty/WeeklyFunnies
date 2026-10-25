import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { approvePage } from "@/lib/pages/generate";

export const POST = defineRoute(routes.approvePage, async ({ user, params }) => ({
  data: { page: await approvePage(params.pageId, user.id) },
}));
