import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { parseMultipart, requireFile } from "@/lib/http/multipart";
import { addHighlightPhoto } from "@/lib/pages/photos";

export const POST = defineRoute(routes.addPhoto, async ({ user, params, body, requestId }) => {
  const parsed = parseMultipart(body.bytes, body.contentType);
  const file = requireFile(parsed, "photo");
  return {
    data: { photo: await addHighlightPhoto(params.highlightId, user.id, file.bytes, requestId) },
    status: 201,
  };
});
