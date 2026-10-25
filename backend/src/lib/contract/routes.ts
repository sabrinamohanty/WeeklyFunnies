import type { z } from "zod";
import { deletedSchema, emptyBody } from "./common";
import {
  createHighlightRequestSchema,
  editionBundleResponseSchema,
  editionIdParams,
  editionResponseSchema,
  editionsResponseSchema,
  generateStoryRequestSchema,
  highlightIdParams,
  highlightResponseSchema,
  generatePanelRequestSchema,
  generatePanelResponseSchema,
  photoIdParams,
  photoResponseSchema,
  photoUploadSchema,
  reorderRequestSchema,
  reorderResponseSchema,
  storyQuerySchema,
  storyResponseSchema,
  updateHighlightRequestSchema,
  updateStoryRequestSchema,
} from "./editions";
import type { ErrorCode } from "./errors";
import {
  createPaperRequestSchema,
  createdInviteResponseSchema,
  inviteIdParams,
  inviteResponseSchema,
  invitesResponseSchema,
  joinRequestSchema,
  paperDetailResponseSchema,
  paperIdParams,
  paperResponseSchema,
  papersResponseSchema,
  updatePaperRequestSchema,
} from "./papers";
import {
  avatarPhotoResponseSchema,
  avatarPhotoUploadSchema,
  avatarStateResponseSchema,
  createAvatarRequestSchema,
  createAvatarResponseSchema,
  geocodeQuerySchema,
  geocodeResponseSchema,
  profileResponseSchema,
  updateProfileRequestSchema,
} from "./profile";
import { cronResultSchema, healthResponseSchema, logoutResponseSchema } from "./session";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export type AuthMode = "none" | "user" | "cron";

export interface RouteContract {
  method: HttpMethod;
  /** OpenAPI-style path, e.g. /api/papers/{paperId}. */
  path: string;
  summary: string;
  tag: string;
  auth: AuthMode;
  phase: number;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?:
    | { kind: "json"; schema: z.ZodType; maxBytes?: number }
    | { kind: "multipart"; schema: z.ZodObject; maxBytes: number };
  success: { status: 200 | 201 | 202; schema: z.ZodType; description?: string };
  errors: ErrorCode[];
  rateLimit?: { perUserPerMinute: number };
}

const AUTHED: ErrorCode[] = ["unauthorized", "rate_limited", "internal"];
const UPLOAD_MAX_BYTES = 12 * 1024 * 1024 + 64 * 1024;

const route = <T extends RouteContract>(r: T) => r;

export const routes = {
  health: route({
    method: "GET",
    path: "/api/health",
    summary: "Liveness check.",
    tag: "system",
    auth: "none",
    phase: 0,
    success: { status: 200, schema: healthResponseSchema },
    errors: ["internal"],
  }),

  // ---------- Profile and onboarding ----------
  getMe: route({
    method: "GET",
    path: "/api/me",
    summary: "Get the caller's profile.",
    tag: "profile",
    auth: "user",
    phase: 2,
    success: { status: 200, schema: profileResponseSchema },
    errors: AUTHED,
  }),
  updateMe: route({
    method: "PATCH",
    path: "/api/me",
    summary: "Create or update profile fields during onboarding. City is resolved server-side from cityId.",
    tag: "profile",
    auth: "user",
    phase: 2,
    body: { kind: "json", schema: updateProfileRequestSchema },
    success: { status: 200, schema: profileResponseSchema },
    errors: ["bad_request", "not_found", ...AUTHED],
  }),
  geocode: route({
    method: "GET",
    path: "/api/geocode",
    summary: "Search for a city. The user picks one and sends its id as cityId.",
    tag: "profile",
    auth: "user",
    phase: 2,
    query: geocodeQuerySchema,
    success: { status: 200, schema: geocodeResponseSchema },
    errors: ["bad_request", "provider_unavailable", ...AUTHED],
    rateLimit: { perUserPerMinute: 20 },
  }),

  // ---------- Avatar ----------
  getAvatar: route({
    method: "GET",
    path: "/api/avatar",
    summary: "Get the caller's look, trait form, and avatars (one per style).",
    tag: "avatar",
    auth: "user",
    phase: 4,
    success: { status: 200, schema: avatarStateResponseSchema },
    errors: AUTHED,
  }),
  createAvatar: route({
    method: "POST",
    path: "/api/avatar",
    summary:
      "Generate and save the caller's avatar in a style, from their stored look (or new traits) and " +
      "optionally their photo. Waits for the image. Calling it again regenerates (capped).",
    tag: "avatar",
    auth: "user",
    phase: 4,
    body: { kind: "json", schema: createAvatarRequestSchema },
    success: { status: 200, schema: createAvatarResponseSchema },
    errors: [
      "bad_request",
      "forbidden",
      "conflict",
      "content_blocked",
      "quota_exceeded",
      "provider_unavailable",
      ...AUTHED,
    ],
    rateLimit: { perUserPerMinute: 5 },
  }),
  uploadAvatarPhoto: route({
    method: "POST",
    path: "/api/avatar/photo",
    summary:
      "Upload a photo for your own avatar, with consent. Moderated, re-encoded, metadata stripped, and " +
      "deleted within an hour. Returns a photoUrl for POST /api/avatar.",
    tag: "avatar",
    auth: "user",
    phase: 4,
    body: { kind: "multipart", schema: avatarPhotoUploadSchema, maxBytes: UPLOAD_MAX_BYTES },
    success: { status: 201, schema: avatarPhotoResponseSchema },
    errors: ["bad_request", "payload_too_large", "unsupported_media", "content_blocked", ...AUTHED],
    rateLimit: { perUserPerMinute: 5 },
  }),

  // ---------- Papers ----------
  listPapers: route({
    method: "GET",
    path: "/api/papers",
    summary: "List papers the caller belongs to.",
    tag: "papers",
    auth: "user",
    phase: 2,
    success: { status: 200, schema: papersResponseSchema },
    errors: AUTHED,
  }),
  createPaper: route({
    method: "POST",
    path: "/api/papers",
    summary: "Create a paper. The caller becomes its owner.",
    tag: "papers",
    auth: "user",
    phase: 2,
    body: { kind: "json", schema: createPaperRequestSchema },
    success: { status: 201, schema: paperResponseSchema },
    errors: ["bad_request", ...AUTHED],
    rateLimit: { perUserPerMinute: 5 },
  }),
  getPaper: route({
    method: "GET",
    path: "/api/papers/{paperId}",
    summary: "Get a paper and its contributor list.",
    tag: "papers",
    auth: "user",
    phase: 2,
    params: paperIdParams,
    success: { status: 200, schema: paperDetailResponseSchema },
    errors: ["bad_request", "not_found", ...AUTHED],
  }),
  updatePaper: route({
    method: "PATCH",
    path: "/api/papers/{paperId}",
    summary: "Rename a paper or change its art style. Owner only.",
    tag: "papers",
    auth: "user",
    phase: 2,
    params: paperIdParams,
    body: { kind: "json", schema: updatePaperRequestSchema },
    success: { status: 200, schema: paperResponseSchema },
    errors: ["bad_request", "forbidden", "not_found", ...AUTHED],
  }),

  // ---------- Invites ----------
  listInvites: route({
    method: "GET",
    path: "/api/papers/{paperId}/invites",
    summary: "List invites. Owner only. Codes are never returned after creation.",
    tag: "invites",
    auth: "user",
    phase: 2,
    params: paperIdParams,
    success: { status: 200, schema: invitesResponseSchema },
    errors: ["forbidden", "not_found", ...AUTHED],
  }),
  createInvite: route({
    method: "POST",
    path: "/api/papers/{paperId}/invites",
    summary: "Create a multi-use invite code valid for 7 days. Owner only. At most 5 active at once.",
    tag: "invites",
    auth: "user",
    phase: 2,
    params: paperIdParams,
    body: { kind: "json", schema: emptyBody },
    success: { status: 201, schema: createdInviteResponseSchema },
    errors: ["forbidden", "not_found", "conflict", ...AUTHED],
    rateLimit: { perUserPerMinute: 10 },
  }),
  revokeInvite: route({
    method: "DELETE",
    path: "/api/papers/{paperId}/invites/{inviteId}",
    summary: "Revoke an invite. Owner only. Idempotent.",
    tag: "invites",
    auth: "user",
    phase: 2,
    params: inviteIdParams,
    success: { status: 200, schema: inviteResponseSchema },
    errors: ["forbidden", "not_found", ...AUTHED],
  }),
  joinPaper: route({
    method: "POST",
    path: "/api/invites/join",
    summary: "Join a paper with an invite code. Joining a paper you're already in returns it.",
    tag: "invites",
    auth: "user",
    phase: 2,
    body: { kind: "json", schema: joinRequestSchema },
    success: { status: 200, schema: paperResponseSchema },
    errors: ["bad_request", "not_found", "conflict", ...AUTHED],
    rateLimit: { perUserPerMinute: 5 },
  }),

  // ---------- Editions ----------
  listEditions: route({
    method: "GET",
    path: "/api/papers/{paperId}/editions",
    summary: "List a paper's published editions and current draft, newest first.",
    tag: "editions",
    auth: "user",
    phase: 4,
    params: paperIdParams,
    success: { status: 200, schema: editionsResponseSchema },
    errors: ["not_found", ...AUTHED],
  }),
  currentEdition: route({
    method: "GET",
    path: "/api/papers/{paperId}/editions/current",
    summary: "Get this week's draft edition, creating it if needed.",
    tag: "editions",
    auth: "user",
    phase: 4,
    params: paperIdParams,
    success: { status: 200, schema: editionResponseSchema },
    errors: ["not_found", ...AUTHED],
  }),
  getEditionBundle: route({
    method: "GET",
    path: "/api/editions/{editionId}",
    summary: "Everything the app needs to render an edition, with short-lived signed image URLs.",
    tag: "editions",
    auth: "user",
    phase: 4,
    params: editionIdParams,
    success: { status: 200, schema: editionBundleResponseSchema },
    errors: ["bad_request", "not_found", ...AUTHED],
  }),
  publishEdition: route({
    method: "POST",
    path: "/api/editions/{editionId}/publish",
    summary:
      "Publish the edition with its story. Owner only. Requires a story that isn't stale and no panel " +
      "still generating; failed panels publish as placeholders. Blocks further edits.",
    tag: "editions",
    auth: "user",
    phase: 4,
    params: editionIdParams,
    body: { kind: "json", schema: emptyBody },
    success: { status: 200, schema: editionResponseSchema },
    errors: ["bad_request", "forbidden", "not_found", "conflict", "edition_locked", ...AUTHED],
  }),
  reorderHighlights: route({
    method: "PUT",
    path: "/api/editions/{editionId}/order",
    summary: "Reorder the caller's own highlights in a draft edition.",
    tag: "highlights",
    auth: "user",
    phase: 4,
    params: editionIdParams,
    body: { kind: "json", schema: reorderRequestSchema },
    success: { status: 200, schema: reorderResponseSchema },
    errors: ["bad_request", "not_found", "edition_locked", ...AUTHED],
  }),

  // ---------- Story and comic ----------
  getStory: route({
    method: "GET",
    path: "/api/story",
    summary:
      "Get the edition's article and comic with panel image statuses. Owner only in drafts; every " +
      "member once published.",
    tag: "story",
    auth: "user",
    phase: 4,
    query: storyQuerySchema,
    success: { status: 200, schema: storyResponseSchema },
    errors: ["bad_request", "forbidden", "not_found", ...AUTHED],
  }),
  generateStory: route({
    method: "POST",
    path: "/api/story",
    summary:
      "Write the article and 4-panel comic script from the edition's approved highlights. Owner only. " +
      "Returns the stored story unless regenerate is true. Panel images start as pending.",
    tag: "story",
    auth: "user",
    phase: 4,
    body: { kind: "json", schema: generateStoryRequestSchema, maxBytes: 64 * 1024 },
    success: { status: 200, schema: storyResponseSchema },
    errors: [
      "bad_request",
      "forbidden",
      "not_found",
      "conflict",
      "edition_locked",
      "quota_exceeded",
      "provider_unavailable",
      ...AUTHED,
    ],
    rateLimit: { perUserPerMinute: 5 },
  }),
  updateStory: route({
    method: "PATCH",
    path: "/api/story",
    summary: "Edit the headline, body, title, captions, or dialogue. Owner only. Edits are moderated.",
    tag: "story",
    auth: "user",
    phase: 4,
    body: { kind: "json", schema: updateStoryRequestSchema, maxBytes: 16 * 1024 },
    success: { status: 200, schema: storyResponseSchema },
    errors: ["bad_request", "forbidden", "not_found", "edition_locked", "content_blocked", ...AUTHED],
  }),
  generatePanel: route({
    method: "POST",
    path: "/api/panel",
    summary:
      "Draw one panel of the stored story and wait for the image. Fire all four in parallel. Returns the " +
      "stored image unless regenerate is true. Owner only.",
    tag: "story",
    auth: "user",
    phase: 4,
    body: { kind: "json", schema: generatePanelRequestSchema, maxBytes: 16 * 1024 },
    success: { status: 200, schema: generatePanelResponseSchema },
    errors: [
      "bad_request",
      "forbidden",
      "not_found",
      "conflict",
      "edition_locked",
      "content_blocked",
      "quota_exceeded",
      "provider_unavailable",
      ...AUTHED,
    ],
    rateLimit: { perUserPerMinute: 20 },
  }),

  // ---------- Highlights ----------
  createHighlight: route({
    method: "POST",
    path: "/api/highlights",
    summary: "Add a highlight (up to 3 per person per edition). Moderated; nothing is generated yet.",
    tag: "highlights",
    auth: "user",
    phase: 4,
    body: { kind: "json", schema: createHighlightRequestSchema, maxBytes: 16 * 1024 },
    success: { status: 201, schema: highlightResponseSchema },
    errors: ["bad_request", "not_found", "conflict", "edition_locked", "content_blocked", ...AUTHED],
    rateLimit: { perUserPerMinute: 10 },
  }),
  getHighlight: route({
    method: "GET",
    path: "/api/highlights/{highlightId}",
    summary: "Get one of the caller's highlights.",
    tag: "highlights",
    auth: "user",
    phase: 4,
    params: highlightIdParams,
    success: { status: 200, schema: highlightResponseSchema },
    errors: ["bad_request", "not_found", ...AUTHED],
  }),
  updateHighlight: route({
    method: "PATCH",
    path: "/api/highlights/{highlightId}",
    summary: "Edit text, toggle serious or inComic, or approve. Edited text is moderated.",
    tag: "highlights",
    auth: "user",
    phase: 4,
    params: highlightIdParams,
    body: { kind: "json", schema: updateHighlightRequestSchema, maxBytes: 16 * 1024 },
    success: { status: 200, schema: highlightResponseSchema },
    errors: ["bad_request", "not_found", "edition_locked", "content_blocked", ...AUTHED],
  }),
  deleteHighlight: route({
    method: "DELETE",
    path: "/api/highlights/{highlightId}",
    summary: "Delete one of the caller's highlights and its photos. Draft editions only.",
    tag: "highlights",
    auth: "user",
    phase: 4,
    params: highlightIdParams,
    success: { status: 200, schema: deletedSchema },
    errors: ["bad_request", "not_found", "edition_locked", ...AUTHED],
  }),

  // ---------- Photos ----------
  addPhoto: route({
    method: "POST",
    path: "/api/highlights/{highlightId}/photos",
    summary: "Attach a photo to one of the caller's highlights (up to 4). Moderated. Draft editions only.",
    tag: "photos",
    auth: "user",
    phase: 4,
    params: highlightIdParams,
    body: { kind: "multipart", schema: photoUploadSchema, maxBytes: UPLOAD_MAX_BYTES },
    success: { status: 201, schema: photoResponseSchema },
    errors: [
      "bad_request",
      "not_found",
      "conflict",
      "edition_locked",
      "payload_too_large",
      "unsupported_media",
      "content_blocked",
      ...AUTHED,
    ],
    rateLimit: { perUserPerMinute: 20 },
  }),
  deletePhoto: route({
    method: "DELETE",
    path: "/api/photos/{photoId}",
    summary: "Delete one of the caller's photos. Allowed at any time, including after publishing.",
    tag: "photos",
    auth: "user",
    phase: 4,
    params: photoIdParams,
    success: { status: 200, schema: deletedSchema },
    errors: ["bad_request", "not_found", ...AUTHED],
  }),

  // ---------- Session ----------
  logout: route({
    method: "POST",
    path: "/api/session/logout",
    summary: "Sign out everywhere and schedule the purge of the caller's draft posts.",
    tag: "session",
    auth: "user",
    phase: 6,
    body: { kind: "json", schema: emptyBody },
    success: { status: 200, schema: logoutResponseSchema },
    errors: AUTHED,
  }),

  // ---------- Internal (cron only) ----------
  runJobs: route({
    method: "GET",
    path: "/api/internal/jobs",
    summary: "Cron: claim and run queued generation jobs, and retry stuck ones.",
    tag: "internal",
    auth: "cron",
    phase: 4,
    success: { status: 200, schema: cronResultSchema },
    errors: ["unauthorized", "internal"],
  }),
  runCleanup: route({
    method: "GET",
    path: "/api/internal/cleanup",
    summary: "Cron: purge expired posts, lapsed sessions, and stale avatar photos (rows and files).",
    tag: "internal",
    auth: "cron",
    phase: 6,
    success: { status: 200, schema: cronResultSchema },
    errors: ["unauthorized", "internal"],
  }),
} as const satisfies Record<string, RouteContract>;

export type RouteId = keyof typeof routes;
