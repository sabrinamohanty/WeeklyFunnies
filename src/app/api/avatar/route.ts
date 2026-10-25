import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { createAvatar, getAvatarState } from "@/lib/avatar/repo";

export const maxDuration = 60;

export const GET = defineRoute(routes.getAvatar, async ({ user }) => ({
  data: await getAvatarState(user.id),
}));

export const POST = defineRoute(routes.createAvatar, async ({ user, body, requestId }) => ({
  data: await createAvatar(user.id, body, requestId),
}));
