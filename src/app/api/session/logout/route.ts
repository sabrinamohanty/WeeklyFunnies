import { bearerToken } from "@/lib/auth";
import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { ApiError } from "@/lib/http/errors";
import { logOutEverywhere } from "@/lib/retention/logout";

export const POST = defineRoute(routes.logout, async ({ user, req }) => {
  const token = bearerToken(req);
  if (!token) throw new ApiError("unauthorized");
  return { data: { signedOut: true as const, purgeAfter: await logOutEverywhere(user.id, token) } };
});
