import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { saveEdition } from "@/lib/editions/repo";

export const PUT = defineRoute(routes.saveEdition, async ({ user, params, body }) => ({
  data: { edition: await saveEdition(params.editionId, user.id, body.saved) },
}));
