import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { requireOwner, revokeInvite } from "@/lib/papers/repo";

export const DELETE = defineRoute(routes.revokeInvite, async ({ user, params }) => {
  await requireOwner(params.paperId, user.id);
  return { data: { invite: await revokeInvite(params.paperId, params.inviteId) } };
});
