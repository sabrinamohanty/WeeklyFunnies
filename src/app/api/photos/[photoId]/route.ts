import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { deletePhoto } from "@/lib/pages/photos";

export const DELETE = defineRoute(routes.deletePhoto, async ({ user, params }) => {
  await deletePhoto(params.photoId, user.id);
  return { data: { id: params.photoId, deleted: true as const } };
});
