import { routes } from "@/lib/contract/routes";
import { defineRoute } from "@/lib/http/handler";
import { uploadAvatarPhoto } from "@/lib/avatar/repo";
import { parseMultipart, requireFile } from "@/lib/http/multipart";

export const POST = defineRoute(routes.uploadAvatarPhoto, async ({ user, body, requestId }) => {
  const parsed = parseMultipart(body.bytes, body.contentType);
  const file = requireFile(parsed, "photo");
  return {
    data: await uploadAvatarPhoto(user.id, file.bytes, parsed.fields.photoConsent ?? "", requestId),
    status: 201,
  };
});
