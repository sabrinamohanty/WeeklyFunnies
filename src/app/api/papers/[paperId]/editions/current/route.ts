import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { currentPaperEdition } from "@/lib/editions/repo";

export const GET = defineRoute(routes.currentEdition, async ({ user, params }) => ({
  data: { edition: await currentPaperEdition(params.paperId, user.id) },
}));
