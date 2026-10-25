import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { getCurrentAuthorPage, setCurrentPapers } from "@/lib/pages/repo";

export const GET = defineRoute(routes.getCurrentPage, async ({ user }) => ({
  data: { page: await getCurrentAuthorPage(user.id) },
}));

export const PUT = defineRoute(routes.setCurrentPagePapers, async ({ user, body }) => ({
  data: { page: await setCurrentPapers(user.id, body.paperIds) },
}));
