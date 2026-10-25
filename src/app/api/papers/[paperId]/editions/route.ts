import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { listPaperEditions } from "@/lib/editions/repo";

export const GET = defineRoute(routes.listEditions, async ({ user, params }) => ({
  data: { editions: await listPaperEditions(params.paperId, user.id) },
}));
