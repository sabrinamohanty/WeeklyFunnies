import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { setReaction } from "@/lib/editions/repo";

export const PUT = defineRoute(routes.setReaction, async ({ user, params, body }) => ({
  data: await setReaction(params.editionId, params.storyId, user.id, body.reaction),
}));
