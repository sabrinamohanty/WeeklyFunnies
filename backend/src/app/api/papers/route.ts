import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { createPaper, getPaper, listPapers } from "@/lib/papers/repo";

export const GET = defineRoute(routes.listPapers, async ({ user }) => ({
  data: { papers: await listPapers(user.id) },
}));

export const POST = defineRoute(routes.createPaper, async ({ user, body }) => {
  const id = await createPaper(user.id, body.name, body.style);
  return { data: { paper: await getPaper(id, "owner") } };
});
