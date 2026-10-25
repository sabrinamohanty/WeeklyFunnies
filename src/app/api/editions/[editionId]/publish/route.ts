import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { publishEdition } from "@/lib/editions/repo";

export const POST = defineRoute(routes.publishEdition, async ({ user, params }) => ({
  data: { edition: await publishEdition(params.editionId, user.id) },
}));
