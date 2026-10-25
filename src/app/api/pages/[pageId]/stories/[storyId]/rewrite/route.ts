import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { rewriteStory } from "@/lib/pages/generate";

export const maxDuration = 60;

export const POST = defineRoute(routes.rewriteStory, async ({ user, params, requestId }) => ({
  data: { story: await rewriteStory(params.pageId, params.storyId, user.id, requestId) },
}));
