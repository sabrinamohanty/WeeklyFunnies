import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { getPaper, listMembers, renamePaper, requireMember, requireOwner } from "@/lib/papers/repo";

export const GET = defineRoute(routes.getPaper, async ({ user, params }) => {
  const role = await requireMember(params.paperId, user.id);
  const [paper, members] = await Promise.all([getPaper(params.paperId, role), listMembers(params.paperId)]);
  return { data: { paper: { ...paper, members } } };
});

export const PATCH = defineRoute(routes.updatePaper, async ({ user, params, body }) => {
  await requireOwner(params.paperId, user.id);
  await renamePaper(params.paperId, body.name);
  return { data: { paper: await getPaper(params.paperId, "owner") } };
});
