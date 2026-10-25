import { getConfig } from "@/lib/config/env";
import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { formatInviteCode, generateInviteCode, hashInviteCode } from "@/lib/papers/invite-code";
import { createInvite, listInvites, requireOwner } from "@/lib/papers/repo";

export const GET = defineRoute(routes.listInvites, async ({ user, params }) => {
  await requireOwner(params.paperId, user.id);
  return { data: { invites: await listInvites(params.paperId) } };
});

export const POST = defineRoute(routes.createInvite, async ({ user, params }) => {
  await requireOwner(params.paperId, user.id);
  const code = generateInviteCode();
  const invite = await createInvite(
    params.paperId,
    user.id,
    hashInviteCode(code, getConfig().INVITE_CODE_PEPPER),
  );
  return { data: { invite: { ...invite, code: formatInviteCode(code) } } };
});
