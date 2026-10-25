import { getConfig } from "@/lib/config/env";
import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { hashInviteCode } from "@/lib/papers/invite-code";
import { getPaper, joinByCodeHash, requireMember } from "@/lib/papers/repo";

export const POST = defineRoute(routes.joinPaper, async ({ user, body }) => {
  const paperId = await joinByCodeHash(hashInviteCode(body.code, getConfig().INVITE_CODE_PEPPER), user.id);
  const role = await requireMember(paperId, user.id);
  return { data: { paper: await getPaper(paperId, role) } };
});
