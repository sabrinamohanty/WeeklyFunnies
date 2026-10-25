import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { leavePaper } from "@/lib/papers/repo";

export const DELETE = defineRoute(routes.leavePaper, async ({ user, params }) => {
  await leavePaper(params.paperId, user.id);
  return { data: { paperId: params.paperId, left: true as const } };
});
