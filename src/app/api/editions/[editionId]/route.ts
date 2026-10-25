import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { getEditionBundle } from "@/lib/editions/repo";

export const GET = defineRoute(routes.getEditionBundle, async ({ user, params }) => ({
  data: { bundle: await getEditionBundle(params.editionId, user.id) },
}));
