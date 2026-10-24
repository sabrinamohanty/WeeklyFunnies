# Meanwhile API contract

Version 0.1.0 (Phase 0). This is the contract the iOS app builds against.

- **Source of truth:** the Zod schemas in `src/lib/contract/`. `docs/openapi.yaml` is generated from them
  (`pnpm openapi`), and a test fails if it drifts. Use the OpenAPI file to generate Swift models.
- **Status:** every route below exists and answers in the standard shapes. Routes whose phase isn't built
  yet return `501 not_implemented` after authentication. The "Phase" column says when each becomes real.
- **Changes:** any change to an endpoint's shape is listed in the changelog at the bottom.

## Conventions

### Base URL and transport

- HTTPS only in deployed environments. JSON bodies use `Content-Type: application/json`, and uploads use
  `multipart/form-data`.
- No CORS headers are sent. The API is for the native app, not browsers.

### Authentication

The app signs in **directly with Supabase Auth** using the project URL and anon key (email and password, or
an emailed magic link). There is no sign-in route on this API. Send the Supabase access token on every
request:

```
Authorization: Bearer <supabase access token>
```

The app refreshes tokens with the Supabase SDK. An expired, tampered, or missing token returns
`401 unauthorized`. The app never receives any other key.

### Success envelope

```json
{ "data": { "...": "..." } }
```

### Error envelope (every error, every route)

```json
{
  "error": {
    "code": "bad_request",
    "message": "The request was invalid.",
    "requestId": "req_3kTq9...",
    "details": [{ "path": "body.name", "issue": "too_big" }],
    "retryAfterSeconds": 12
  }
}
```

- `message` is always generic and safe to show. Use `code` for logic.
- `details` appears only for validation errors. It lists field paths and issue codes, never your input.
- `retryAfterSeconds` (and a `Retry-After` header) appear on `rate_limited`.
- Every response carries `X-Request-Id`. Include it in bug reports.

| code                   | HTTP | Meaning                                                                   |
| ---------------------- | ---- | ------------------------------------------------------------------------- |
| `bad_request`          | 400  | Validation failed: unknown field, wrong type, bad length or format        |
| `unauthorized`         | 401  | Missing, expired, or invalid token                                        |
| `forbidden`            | 403  | Signed in and a member, but not allowed (e.g. non-owner publishing)       |
| `not_found`            | 404  | Doesn't exist **or** you can't see it (we never reveal which)             |
| `method_not_allowed`   | 405  | Wrong HTTP method for this path (`Allow` header lists valid ones)         |
| `conflict`             | 409  | Conflicts with current state (e.g. 4th highlight, avatar not ready)       |
| `edition_locked`       | 409  | Edition is published; edits are blocked                                   |
| `payload_too_large`    | 413  | Body or file over the limit                                               |
| `unsupported_media`    | 415  | Wrong content type or file type                                           |
| `content_blocked`      | 422  | Moderation blocked the text. Show the message and let the user rewrite it |
| `rate_limited`         | 429  | Too many requests; wait `retryAfterSeconds`                               |
| `quota_exceeded`       | 429  | Daily AI cap reached for this user                                        |
| `internal`             | 500  | Unexpected server error                                                   |
| `not_implemented`      | 501  | Route exists but its phase isn't built yet                                |
| `provider_unavailable` | 503  | AI provider is down or the circuit breaker is open; retry later           |

### Data rules

- **Strict input.** Unknown fields in bodies, unknown query parameters, and bodies on routes that take none
  are all rejected with `bad_request`.
- **Ids** are UUIDs. **Timestamps** are ISO 8601 with offset. **Dates** are `YYYY-MM-DD`.
- **Text cleaning.** All text input is normalized to NFC, stripped of control and invisible characters
  (zero-width spaces, direction overrides; ZWJ and ZWNJ are kept for emoji and scripts), whitespace is
  normalized, and the result is trimmed. Length limits count Unicode code points **after** cleaning. The
  response returns the cleaned value; display that.
- **Render all text as plain text.** Never interpret headlines, articles, or names as HTML or Markdown.
- **Signed URLs** expire (default 10 minutes). The bundle includes `urlsExpireAt`; refetch after that. Don't
  persist URLs. Storage paths are never exposed.

| Field                 | Limit (code points) |
| --------------------- | ------------------- |
| Person name           | 1 to 60             |
| Paper name            | 1 to 60             |
| Highlight text        | 1 to 500            |
| Headline (edit)       | 1 to 120            |
| Article (edit)        | 1 to 600            |
| Avatar tweak note     | 1 to 80             |
| City search query     | 2 to 80             |
| Highlights per person | 1 to 3 per edition  |
| Photos per highlight  | up to 4             |
| Upload size           | 12 MB per file      |
| JSON body (default)   | 8 KB (16 KB events) |

### Uploads

- Accepted: JPEG and PNG, verified by file content, not extension. HEIC is **not** accepted: convert on
  device to JPEG (about 2048 px on the long edge) before upload.
- Rejected: SVG, anything executable, zero-byte, corrupt, oversized, or with extreme dimensions.
- Images are re-encoded server-side and all metadata (EXIF, GPS) is stripped.

### Async work and polling

Avatar and panel generation take 10 to 30 seconds and can fail. Those routes return `202` immediately with
a `status` of `pending`, `generating`, `ready`, or `failed`. Poll the matching GET every 2 to 3 seconds
(back off after 60 seconds). On `failed`, `error` is one of `generation_failed`, `content_blocked`, or
`provider_unavailable`.

### Rate limits

Per IP and per user (default 120 and 60 requests per minute), plus tighter per-route limits on
generation, uploads, and joining. AI calls also have per-user daily caps (`quota_exceeded`).

## Endpoints

| Method | Path                                       | Purpose                                      | Phase |
| ------ | ------------------------------------------ | -------------------------------------------- | ----- |
| GET    | `/api/health`                              | Liveness (no auth)                           | 0     |
| GET    | `/api/me`                                  | Caller's profile                             | 2     |
| PATCH  | `/api/me`                                  | Set name, city, birthday (onboarding)        | 2     |
| GET    | `/api/geocode?q=`                          | City candidates for onboarding               | 2     |
| GET    | `/api/avatar`                              | Approved avatar and draft status             | 4     |
| POST   | `/api/avatar`                              | Upload selfie, start generation              | 4     |
| POST   | `/api/avatar/regenerate`                   | Regenerate from retained selfie, with tweaks | 4     |
| POST   | `/api/avatar/approve`                      | Approve draft; deletes selfie                | 4     |
| GET    | `/api/papers`                              | My papers                                    | 2     |
| POST   | `/api/papers`                              | Create a paper (caller becomes owner)        | 2     |
| GET    | `/api/papers/{paperId}`                    | Paper and contributor list                   | 2     |
| PATCH  | `/api/papers/{paperId}`                    | Rename (owner)                               | 2     |
| GET    | `/api/papers/{paperId}/invites`            | List invites (owner; no codes)               | 2     |
| POST   | `/api/papers/{paperId}/invites`            | Create invite code (owner)                   | 2     |
| DELETE | `/api/papers/{paperId}/invites/{inviteId}` | Revoke invite (owner)                        | 2     |
| POST   | `/api/invites/join`                        | Join by code                                 | 2     |
| GET    | `/api/papers/{paperId}/editions`           | Editions list                                | 4     |
| GET    | `/api/papers/{paperId}/editions/current`   | This week's draft (get or create)            | 4     |
| GET    | `/api/editions/{editionId}`                | **Edition bundle**                           | 4     |
| POST   | `/api/editions/{editionId}/publish`        | Publish (owner)                              | 4     |
| PUT    | `/api/editions/{editionId}/order`          | Reorder my events                            | 4     |
| POST   | `/api/events`                              | Add a highlight; returns generated text      | 4     |
| GET    | `/api/events/{eventId}`                    | My event (poll panel status)                 | 4     |
| PATCH  | `/api/events/{eventId}`                    | Edit, toggle flags, approve                  | 4     |
| DELETE | `/api/events/{eventId}`                    | Delete my event                              | 4     |
| POST   | `/api/events/{eventId}/panel`              | Start panel generation (202)                 | 4     |
| POST   | `/api/events/{eventId}/photos`             | Attach a photo                               | 4     |
| DELETE | `/api/photos/{photoId}`                    | Delete my photo (any time)                   | 4     |
| POST   | `/api/session/logout`                      | Sign out everywhere; schedule purge          | 6     |
| GET    | `/api/internal/jobs`                       | Cron only                                    | 4     |
| GET    | `/api/internal/cleanup`                    | Cron only                                    | 6     |

Full request and response schemas are in `docs/openapi.yaml`. Key shapes and behaviors:

### Profile and onboarding

`PATCH /api/me` takes any of `{ "name", "cityId", "birthday" }`; at least one is required.

- `cityId` comes from `GET /api/geocode?q=Kumasi`, which returns up to 10 `CityCandidate`s
  (`id, name, admin1, country, countryCode, latitude, longitude, timezone`). The user picks one. The server
  re-resolves the id itself, so coordinates and timezone are never trusted from the client. Coordinates are
  stored server-side and not returned afterwards.
- `birthday` is a full date. The zodiac sign is derived from it. Other members only ever see month and day.
- `Profile.onboarded` is true once name, city, birthday, and an approved avatar all exist.

### Avatar flow

1. `POST /api/avatar` (multipart: `selfie` file, optional `tweaks` JSON string) returns `202` with
   `AvatarState` (`draft.status = generating`).
2. Poll `GET /api/avatar` until `draft.status` is `ready` or `failed`.
3. Optionally `POST /api/avatar/regenerate` with `{ "tweaks": { ... } }`. This reuses the retained selfie.
4. `POST /api/avatar/approve` makes the draft the profile avatar and **deletes the selfie**.

The selfie is kept only until approval, and never longer than `draft.selfieExpiresAt` (1 hour). After that,
regenerating needs a new selfie. `AvatarTweaks`: `hairStyle`, `hairColor`, `facialHair`, `glasses`,
`headwear` (fixed options) plus an optional `note` (80 characters, moderated).

### Papers and invites

- Users can be in several papers. Paper size is capped at 12 members.
- `POST /api/papers/{paperId}/invites` returns `CreatedInvite` with `code` **once**. Only a hash is stored.
  Codes are 12 characters of Crockford base32 (about 60 bits), shown as `XXXX-XXXX-XXXX`. They're
  multi-use, valid for 7 days, and revocable.
- `POST /api/invites/join` with `{ "code" }` is case-insensitive and ignores spaces and dashes. Unknown,
  expired, and revoked codes all return the same `not_found`. A full paper returns `conflict`. Repeated
  wrong guesses are rate-limited.

### Highlights (events)

`POST /api/events` with `{ "editionId", "text", "serious": false }` runs moderation and the writer, then
returns `201 { event: OwnEvent }`:

```json
{
  "id": "…",
  "editionId": "…",
  "userId": "…",
  "sourceText": "Ran my first 5K in Kumasi",
  "headline": "…",
  "article": "…",
  "serious": false,
  "inComic": true,
  "approved": false,
  "position": 0,
  "panel": { "status": "pending", "url": null, "error": null },
  "photos": [],
  "notices": [],
  "createdAt": "…",
  "updatedAt": "…",
  "expiresAt": "…"
}
```

- Blocked text returns `422 content_blocked` (nothing is saved). Self-harm or crisis content is blocked with
  a supportive message. The app should show the message and supportive resources.
- If moderation flags a sensitive topic (loss, illness, breakup), `serious` is forced on, `inComic` defaults
  to false, and `notices` includes `marked_serious`. Serious events never get puns.
- If generation fails validation twice, safe default text is used and `notices` includes `fallback_used`.
- More than 3 events in an edition returns `conflict`. A published edition returns `edition_locked`.

`PATCH /api/events/{eventId}` takes any of `headline`, `article`, `serious`, `inComic`, `approved`. Editing
content or flags clears approval unless `approved: true` is in the same request. Edited text is moderated.

`POST /api/events/{eventId}/panel` with `{ "regenerate": false }` returns
`202 { eventId, panel }` and is idempotent:

- `generating`: returns the current state; no new job.
- `ready` and `regenerate=false`: returns the ready panel; no new job.
- `ready` and `regenerate=true`, or `failed`: starts a new job (counts toward the daily image cap).

Poll `GET /api/events/{eventId}`. Panels are drawn from the text only, never from photos. Events with
`inComic=false` don't get panels.

`PUT /api/editions/{editionId}/order` with `{ "eventIds": [...] }` must list all of the caller's events in
that edition.

### Photos

`POST /api/events/{eventId}/photos` (multipart `photo`) returns `201 { photo }`. There can be up to 4 per
event, in drafts only. `DELETE /api/photos/{photoId}` works at any time, including after publishing.

### Edition bundle: `GET /api/editions/{editionId}`

```json
{
  "bundle": {
    "edition": { "id", "paperId", "paperName", "weekStart", "weekEnd", "status", "publishedAt", "expiresAt" },
    "viewer": { "userId", "role" },
    "members": [{ "userId", "name", "city", "zodiacSign", "avatarUrl", "role" }],
    "myEvents": ["OwnEvent, …"],
    "strips": [{ "userId", "status": "not_started|in_progress|approved", "events": ["BundleEvent, …"] }],
    "weather": { "city", "timezone", "fetchedAt", "days": [{ "date", "tempMaxC", "tempMinC", "precipitationChance", "weatherCode", "summary" }] },
    "horoscopes": [{ "sign", "text", "userIds": ["…"] }],
    "birthdays": [{ "userId", "name", "monthDay": "10-27" }],
    "urlsExpireAt": "…"
  }
}
```

- `BundleEvent` is what other members see: `id, editionId, userId, headline, article, serious, inComic,
position, panel, photos`. It never includes `sourceText`.
- `myEvents` holds the viewer's own events with review fields.
- **Drafts are private.** In a draft edition, every strip's `events` is empty, even for approved strips:
  members see only their own posts, plus each member's progress `status` so the owner knows who's ready.
  Other members' events appear only after publishing. Row-level security enforces the same rule.
- **Weather is the reader's own city**: a 7-day forecast, cached per city per day. Temperatures are in °C;
  convert on device. It's `null` if the reader has no city.
- Birthdays are members whose month and day fall inside the edition week. The year is never sent.
- Weeks run Monday to Sunday in the paper owner's timezone.

### Publishing

`POST /api/editions/{editionId}/publish` is owner only. It publishes **approved strips only**: unapproved
drafts are excluded from the published edition. At least one approved event is required (`conflict`
otherwise). After publishing, event and photo edits return `edition_locked`, except photo deletion.

### Logout and retention (what the app should expect)

Call `POST /api/session/logout` **before** clearing the local Supabase session. It signs the user out on
all devices.

- **Draft posts** (highlights, generated text, panels, photos in unpublished editions) are hidden
  immediately and deleted after 24 hours unless the user signs back in, which cancels the purge.
- **Posts in a published edition** stay until 30 days after that edition was published, then they're
  deleted, regardless of logout.
- While signed in, activity keeps draft posts alive on a 30-day sliding window.
- The avatar and profile are kept until account deletion. Selfies are never kept past avatar approval
  (1 hour at most).

## AI layer (server-side only, for reference)

The app never calls AI directly. Routes call a vendor-neutral `AiService`. A thin `AiProvider` underneath
is the only code that knows a vendor, selected by `AI_PROVIDER=stub|real`. Moderation is a separate
`Moderator` (`MODERATION_PROVIDER=stub|real`). Definitions are in `src/lib/ai/types.ts`.

```ts
interface AiService {
  generateAvatar(
    i: { selfie: ImageBytes; tweaks?: AvatarTweaks; style: StyleConfig },
    ctx,
  ): Promise<ImageBytes>;
  writeEvent(
    i: { text: string; serious: boolean; authorFirstName: string },
    ctx,
  ): Promise<{ headline; article; panel: PanelSpec; moderation: ModerationResult; usedFallback: boolean }>;
  generatePanel(
    i: { avatar: ImageBytes; panel: PanelSpec; serious: boolean; style: StyleConfig },
    ctx,
  ): Promise<ImageBytes>;
  generateHoroscope(i: { sign: ZodiacSign; weekStart: string }, ctx): Promise<string>;
}

type PanelSpec = {
  setting: string /* ≤80 */;
  action: string /* ≤120 */;
  mood: Mood;
  props: string[]; /* ≤3 × ≤30 */
};

interface AiProvider {
  completeJson(
    req: { system; user; jsonSchema; maxOutputTokens },
    ctx,
  ): Promise<{ raw: unknown; meta: CallMeta }>;
  generateImage(
    req: { prompt; reference: ImageBytes; style: StyleConfig; seed? },
    ctx,
  ): Promise<{ image; meta: CallMeta }>;
}

interface Moderator {
  checkText(text: string, ctx): Promise<{ decision: "allow" | "sensitive" | "block"; categories: string[] }>;
}
```

## Changelog

- **0.1.0 (Phase 0):** initial contract. Changes from the original brief, all agreed in planning:
  - Avatar generation is asynchronous (`202` and polling), with separate `regenerate` and `approve` routes,
    instead of returning the avatar URL directly.
  - `writeEvent` returns a structured `PanelSpec` instead of a free-text `panelPrompt`.
  - Weather is the reader's own city, fetched live and cached daily, not frozen per edition.
  - Added: `GET /api/events/{eventId}` (polling), `DELETE /api/events/{eventId}`,
    `PUT /api/editions/{editionId}/order` (bulk reorder), `GET /api/geocode`, and
    `GET /api/papers/{paperId}/editions[/current]`.
