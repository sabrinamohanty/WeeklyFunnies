import type { z } from "zod";
import { deletedSchema, emptyBody } from "./common";
import {
  editionBundleResponseSchema,
  editionIdParams,
  editionResponseSchema,
  editionsResponseSchema,
  editionStoryParams,
  reactionResponseSchema,
  saveEditionRequestSchema,
  setReactionRequestSchema,
} from "./editions";
import {
  createHighlightRequestSchema,
  currentPageResponseSchema,
  drawPanelRequestSchema,
  generatePageRequestSchema,
  highlightIdParams,
  highlightResponseSchema,
  pageIdParams,
  pagePanelParams,
  pageResponseSchema,
  pageStoryParams,
  panelResponseSchema,
  photoIdParams,
  photoResponseSchema,
  photoUploadSchema,
  reorderHighlightsRequestSchema,
  reorderPanelsRequestSchema,
  setPagePapersRequestSchema,
  storyResponseSchema,
  updateHighlightRequestSchema,
  updatePageRequestSchema,
} from "./pages";
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
import { weatherQuerySchema, weatherResponseSchema } from "./weather";

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
  /** Per-route limits on top of the global per-IP and per-user limits. */
  rateLimit?: { perUserPerMinute: number; perIpPerMinute?: number };
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
  getWeather: route({
    method: "GET",
    path: "/api/weather",
    summary:
      "7-day forecast for the browser's location if given (rounded, never stored), else the profile city.",
    tag: "profile",
    auth: "user",
    phase: 5,
    query: weatherQuerySchema,
    success: { status: 200, schema: weatherResponseSchema },
    errors: ["bad_request", "provider_unavailable", ...AUTHED],
    rateLimit: { perUserPerMinute: 20 },
  }),

  // ---------- Avatar ----------
  getAvatar: route({
    method: "GET",
    path: "/api/avatar",
    summary: "Get the caller's style, look, trait form, and avatar.",
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
      "Draw the caller's avatar in their style (optionally switching style first), from their stored " +
      "look or new traits, and optionally their photo. Waits for the image. Calling again redraws (capped).",
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
    summary: "Rename a paper. Owner only.",
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
    rateLimit: { perUserPerMinute: 5, perIpPerMinute: 20 },
  }),

  // ---------- Editions ----------
  listEditions: route({
    method: "GET",
    path: "/api/papers/{paperId}/editions",
    summary: "List a paper's current draft and published editions (back issues), newest first.",
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
    summary:
      "Everything needed to render an edition: members, progress, published pages with reactions, " +
      "horoscopes, and birthdays. Signed image URLs are short-lived.",
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
      "Publish the edition with every approved page. Owner only, after the deadline. Panels still " +
      "generating block publishing; failed panels publish as placeholders.",
    tag: "editions",
    auth: "user",
    phase: 4,
    params: editionIdParams,
    body: { kind: "json", schema: emptyBody },
    success: { status: 200, schema: editionResponseSchema },
    errors: ["bad_request", "forbidden", "not_found", "conflict", ...AUTHED],
  }),
  saveEdition: route({
    method: "PUT",
    path: "/api/editions/{editionId}/saved",
    summary: "Keep a published edition forever, or undo that. Owner only. Applies to every member.",
    tag: "editions",
    auth: "user",
    phase: 4,
    params: editionIdParams,
    body: { kind: "json", schema: saveEditionRequestSchema },
    success: { status: 200, schema: editionResponseSchema },
    errors: ["bad_request", "forbidden", "not_found", "conflict", ...AUTHED],
  }),
  setReaction: route({
    method: "PUT",
    path: "/api/editions/{editionId}/stories/{storyId}/reaction",
    summary: "React to a story in a published edition (one reaction per member), or remove it.",
    tag: "editions",
    auth: "user",
    phase: 4,
    params: editionStoryParams,
    body: { kind: "json", schema: setReactionRequestSchema },
    success: { status: 200, schema: reactionResponseSchema },
    errors: ["bad_request", "not_found", "conflict", ...AUTHED],
    rateLimit: { perUserPerMinute: 60 },
  }),

  // ---------- Pages: your highlights, stories, and comic for the week ----------
  getCurrentPage: route({
    method: "GET",
    path: "/api/pages/current",
    summary: "Get your page for this week, or null if you haven't picked papers yet.",
    tag: "pages",
    auth: "user",
    phase: 4,
    success: { status: 200, schema: currentPageResponseSchema },
    errors: AUTHED,
  }),
  setCurrentPagePapers: route({
    method: "PUT",
    path: "/api/pages/current",
    summary:
      "Pick the papers this week's page goes to, creating the page if needed. Each paper's current " +
      "edition must still be open.",
    tag: "pages",
    auth: "user",
    phase: 4,
    body: { kind: "json", schema: setPagePapersRequestSchema },
    success: { status: 200, schema: pageResponseSchema },
    errors: ["bad_request", "not_found", "edition_locked", ...AUTHED],
  }),
  getPage: route({
    method: "GET",
    path: "/api/pages/{pageId}",
    summary: "Get one of your pages.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: pageIdParams,
    success: { status: 200, schema: pageResponseSchema },
    errors: ["bad_request", "not_found", ...AUTHED],
  }),
  updatePage: route({
    method: "PATCH",
    path: "/api/pages/{pageId}",
    summary: "Edit headlines, story text, the comic title, captions, or dialogue. Edits are moderated.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: pageIdParams,
    body: { kind: "json", schema: updatePageRequestSchema, maxBytes: 16 * 1024 },
    success: { status: 200, schema: pageResponseSchema },
    errors: ["bad_request", "not_found", "conflict", "edition_locked", "content_blocked", ...AUTHED],
  }),
  addHighlight: route({
    method: "POST",
    path: "/api/pages/{pageId}/highlights",
    summary: "Add a highlight (up to 3). Moderated; nothing is generated yet.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: pageIdParams,
    body: { kind: "json", schema: createHighlightRequestSchema, maxBytes: 16 * 1024 },
    success: { status: 201, schema: highlightResponseSchema },
    errors: ["bad_request", "not_found", "conflict", "edition_locked", "content_blocked", ...AUTHED],
    rateLimit: { perUserPerMinute: 10 },
  }),
  reorderHighlights: route({
    method: "PUT",
    path: "/api/pages/{pageId}/highlights/order",
    summary: "Reorder your highlights. Stories follow the same order.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: pageIdParams,
    body: { kind: "json", schema: reorderHighlightsRequestSchema },
    success: { status: 200, schema: pageResponseSchema },
    errors: ["bad_request", "not_found", "edition_locked", ...AUTHED],
  }),
  generatePage: route({
    method: "POST",
    path: "/api/pages/{pageId}/generate",
    summary:
      "Write a story for each highlight and a 4-panel comic script, in your style. Returns the stored " +
      "page unless regenerate is true. Panel images start as pending; draw them with the panel route.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: pageIdParams,
    body: { kind: "json", schema: generatePageRequestSchema },
    success: { status: 200, schema: pageResponseSchema },
    errors: [
      "bad_request",
      "not_found",
      "conflict",
      "edition_locked",
      "quota_exceeded",
      "provider_unavailable",
      ...AUTHED,
    ],
    rateLimit: { perUserPerMinute: 5 },
  }),
  rewriteStory: route({
    method: "POST",
    path: "/api/pages/{pageId}/stories/{storyId}/rewrite",
    summary: "Write a new headline and story for one highlight. Limited per page.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: pageStoryParams,
    body: { kind: "json", schema: emptyBody },
    success: { status: 200, schema: storyResponseSchema },
    errors: [
      "bad_request",
      "not_found",
      "conflict",
      "edition_locked",
      "quota_exceeded",
      "provider_unavailable",
      ...AUTHED,
    ],
    rateLimit: { perUserPerMinute: 10 },
  }),
  drawPanel: route({
    method: "POST",
    path: "/api/pages/{pageId}/panels/{index}",
    summary:
      "Draw one panel and wait for the image. Fire all four in parallel after generating. Returns the " +
      "stored image unless regenerate is true.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: pagePanelParams,
    body: { kind: "json", schema: drawPanelRequestSchema },
    success: { status: 200, schema: panelResponseSchema },
    errors: [
      "bad_request",
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
  reorderPanels: route({
    method: "PUT",
    path: "/api/pages/{pageId}/panels/order",
    summary: "Reorder the comic's panels.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: pageIdParams,
    body: { kind: "json", schema: reorderPanelsRequestSchema },
    success: { status: 200, schema: pageResponseSchema },
    errors: ["bad_request", "not_found", "conflict", "edition_locked", ...AUTHED],
  }),
  approvePage: route({
    method: "POST",
    path: "/api/pages/{pageId}/approve",
    summary:
      "Approve your page for every linked paper. Needs generated, non-stale content and no panel still " +
      "generating. Any later edit clears approval.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: pageIdParams,
    body: { kind: "json", schema: emptyBody },
    success: { status: 200, schema: pageResponseSchema },
    errors: ["bad_request", "not_found", "conflict", "edition_locked", ...AUTHED],
  }),

  // ---------- Highlights and photos ----------
  getHighlight: route({
    method: "GET",
    path: "/api/highlights/{highlightId}",
    summary: "Get one of your highlights.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: highlightIdParams,
    success: { status: 200, schema: highlightResponseSchema },
    errors: ["bad_request", "not_found", ...AUTHED],
  }),
  updateHighlight: route({
    method: "PATCH",
    path: "/api/highlights/{highlightId}",
    summary: "Edit text or toggle serious or inComic. Edited text is moderated. Marks the page stale.",
    tag: "pages",
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
    summary: "Delete one of your highlights and its photos, before the deadline. Marks the page stale.",
    tag: "pages",
    auth: "user",
    phase: 4,
    params: highlightIdParams,
    success: { status: 200, schema: deletedSchema },
    errors: ["bad_request", "not_found", "edition_locked", ...AUTHED],
  }),
  addPhoto: route({
    method: "POST",
    path: "/api/highlights/{highlightId}/photos",
    summary: "Attach a photo to one of your highlights (up to 4). Moderated. Before the deadline only.",
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
    summary: "Delete one of your photos. Allowed at any time, including after publishing.",
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
    summary:
      "Cron: purge editions past their 14-day expiry (unless saved), lapsed drafts, and stale avatar " +
      "photos (rows and files).",
    tag: "internal",
    auth: "cron",
    phase: 6,
    success: { status: 200, schema: cronResultSchema },
    errors: ["unauthorized", "internal"],
  }),
} as const satisfies Record<string, RouteContract>;

export type RouteId = keyof typeof routes;
