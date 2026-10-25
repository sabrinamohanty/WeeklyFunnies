import { getConfig } from "@/lib/config/env";
import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { ApiError } from "@/lib/http/errors";
import { generateInviteCode, hashInviteCode } from "@/lib/papers/invite-code";
import { activeInviteHashExists, createInvite, listInvites, requireOwner } from "@/lib/papers/repo";

export const GET = defineRoute(routes.listInvites, async ({ user, params }) => {
  await requireOwner(params.paperId, user.id);
  return { data: { invites: await listInvites(params.paperId) } };
});

export const POST = defineRoute(routes.createInvite, async ({ user, params }) => {
  await requireOwner(params.paperId, user.id);
  const pepper = getConfig().INVITE_CODE_PEPPER;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const codeHash = hashInviteCode(code, pepper);
    if (await activeInviteHashExists(codeHash)) continue;
    const invite = await createInvite(params.paperId, user.id, codeHash);
    return { data: { invite: { ...invite, code } } };
  }
  throw new ApiError("internal");
});
