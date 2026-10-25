# Meanwhile API contract

Version 0.5.0 (Phase 3). This is the contract the web app (`WeeklyFunnies-frontend`) builds against.

- **Source of truth:** the Zod schemas in `src/lib/contract/`. `docs/openapi.yaml` is generated from them
  (`pnpm openapi`), and a test fails if it drifts. Use the OpenAPI file to generate client types.
- **Status:** every route below exists and answers in the standard shapes. Routes whose phase isn't built
  yet return `501 not_implemented` after authentication. The "Phase" column says when each becomes real.
- **Changes:** any change to an endpoint's shape is listed in the changelog at the bottom.

## Conventions

### Transport and CORS

- HTTPS only in deployed environments. JSON bodies use `Content-Type: application/json`, and uploads use
  `multipart/form-data`.
- The web app runs on its own origin. Only origins listed in `CORS_ALLOWED_ORIGINS` (exact match, https in
  production) get CORS headers; browsers block every other origin. Auth is a bearer token, never cookies.
- The browser never calls an AI model or holds a provider key. Every generation goes through this API.

### Authentication

The web app signs in **directly with Supabase Auth** using the project URL and anon key (email and
password, or an emailed magic link). There is no sign-in route on this API. Send the Supabase access token
on every request:

```
Authorization: Bearer <supabase access token>
```

An expired, tampered, revoked (signed out), or missing token returns `401 unauthorized`. The app never
receives any other key.

### Success responses

Success bodies are bare JSON, for example `{ "avatarUrl": "…" }` or `{ "paper": { … } }`. Every response
carries `X-Request-Id`.

### Errors (every error, every route)

```json
{
  "error": "The request was invalid.",
  "code": "bad_request",
  "requestId": "req_3kTq9...",
  "details": [{ "path": "body.name", "issue": "too_big" }],
  "retryAfterSeconds": 12
}
```

- `error` is a user-safe message to show. It's the generic message for the code, except for the fixed
  self-harm support message (see below). Use `code` for logic.
- `details` appears for validation and moderation errors. It lists field paths and issue codes, never input.
- `retryAfterSeconds` (and a `Retry-After` header) appear on `rate_limited` and `quota_exceeded`.

| code                   | HTTP | Meaning                                                                   |
| ---------------------- | ---- | ------------------------------------------------------------------------- |
| `bad_request`          | 400  | Validation failed: unknown field, wrong type, bad length, unknown id      |
| `unauthorized`         | 401  | Missing, expired, revoked, or invalid token                               |
| `forbidden`            | 403  | Signed in and a member, but not allowed (e.g. non-owner publishing)       |
| `not_found`            | 404  | Doesn't exist **or** you can't see it (we never reveal which)             |
| `method_not_allowed`   | 405  | Wrong HTTP method for this path (`Allow` header lists valid ones)         |
| `conflict`             | 409  | Conflicts with current state (e.g. 4th highlight, panel being drawn)      |
| `edition_locked`       | 409  | The deadline has passed; the page can't change                            |
| `payload_too_large`    | 413  | Body or file over the limit                                               |
| `unsupported_media`    | 415  | Wrong content type or file type                                           |
| `content_blocked`      | 422  | Moderation blocked the text or photo. Show the message; let the user edit |
| `rate_limited`         | 429  | Too many requests; wait `retryAfterSeconds`                               |
| `quota_exceeded`       | 429  | Daily or per-page generation cap reached                                  |
| `internal`             | 500  | Unexpected server error                                                   |
| `not_implemented`      | 501  | Route exists but its phase isn't built yet                                |
| `provider_unavailable` | 503  | AI provider is down, timed out, or the circuit breaker is open; retry     |

**Self-harm.** Text about self-harm or crisis is blocked with a fixed supportive `error` message and
`details: [{ "path": "body.text", "issue": "self_harm_support" }]`. Show the message with support resources
whenever you see `self_harm_support`. Other blocks use issue `content_blocked`.

### Data rules

- **Strict input.** Unknown fields, unknown query parameters, and bodies on routes that take none are all
  rejected with `bad_request`.
- **Ids from the client are never trusted.** Every paper, edition, page, story, highlight and photo id is
  checked against the database (auth, then membership, then ownership).
- **Ids** are UUIDs. **Timestamps** are ISO 8601 with offset. **Dates** are `YYYY-MM-DD`.
- **Text cleaning.** All text input is normalized to NFC, stripped of control and invisible characters
  (ZWJ and ZWNJ are kept for emoji and scripts), whitespace is normalized, and the result is trimmed.
  Lengths count Unicode code points **after** cleaning. Responses return the cleaned value.
- **Render all text as plain text**, including headlines, captions, dialogue and names. Never as HTML.
  Headlines come in sentence case; style them with CSS if you want Title Case or capitals.
- **Signed URLs** expire (default 10 minutes). Refetch after `urlsExpireAt`; don't persist URLs. Storage
  paths are never exposed.

| Field                         | Limit                       |
| ----------------------------- | --------------------------- |
| Person name, paper name       | 1 to 60 code points         |
| Highlight text                | 1 to 500 code points        |
| Highlights per page           | 1 to 3                      |
| Photos per highlight          | up to 4                     |
| Papers per page               | 1 to 10                     |
| People per paper              | up to 8                     |
| Headline / title / story edit | 120 / 80 / 600              |
| Caption / dialogue line       | 15 words / 12 words         |
| Avatar trait note             | 1 to 80 code points         |
| City search query             | 2 to 80 code points         |
| Upload size                   | 12 MB per file              |
| JSON body                     | 8 KB default (16–64 KB gen) |

### Uploads

- Accepted: JPEG and PNG, verified by file content, not extension. Convert HEIC to JPEG on the client
  (about 2048 px on the long edge) before upload.
- Rejected: SVG, anything executable, zero-byte, corrupt, oversized, or with extreme dimensions.
- Images are moderated, re-encoded server-side, and all metadata (EXIF, GPS) is stripped.

### Rate limits and caps

Per IP and per user (default 120 and 60 requests per minute), plus tighter per-route limits on generation,
uploads and joining. Joining is also limited per IP (20 a minute), so many accounts can't share one
machine to guess codes. Generation has per-user daily caps and per-page caps (`quota_exceeded`):
5 regenerations, 10 story rewrites and 12 panel redraws per page.

## The model in one paragraph

Each person writes **one page per week**. A page has up to 3 highlights; generating it writes **one story
per highlight** (section, headline, body) and **one 4-panel comic strip starring only that person**, in the
person's own **style** (`classic`, `manga`, `sketch`, `superhero`). The person picks which of their papers
the page goes to; the same page appears in each one. A paper's **edition** for the week is the set of
approved pages from its members. Editions close at the **deadline**, Sunday 11:59 p.m. in the paper owner's
timezone, and the owner then **publishes**. Published editions are back issues for 14 days unless the
owner saves them.

## Endpoints

| Method | Path                                                   | Purpose                                    | Phase |
| ------ | ------------------------------------------------------ | ------------------------------------------ | ----- |
| GET    | `/api/health`                                          | Liveness (no auth)                         | 0     |
| GET    | `/api/me`                                              | Caller's profile                           | 2     |
| PATCH  | `/api/me`                                              | Set name, city, birthday, style            | 2     |
| GET    | `/api/geocode?q=`                                      | City candidates for onboarding             | 2     |
| GET    | `/api/weather?lat=&lon=`                               | Weather for the reader                     | 5     |
| GET    | `/api/papers`                                          | My papers                                  | 2     |
| POST   | `/api/papers`                                          | Create a paper (caller is owner)           | 2     |
| GET    | `/api/papers/{paperId}`                                | Paper and contributor list                 | 2     |
| PATCH  | `/api/papers/{paperId}`                                | Rename (owner)                             | 2     |
| GET    | `/api/papers/{paperId}/invites`                        | List invites (owner; no codes)             | 2     |
| POST   | `/api/papers/{paperId}/invites`                        | Create invite code (owner)                 | 2     |
| DELETE | `/api/papers/{paperId}/invites/{inviteId}`             | Revoke invite (owner)                      | 2     |
| POST   | `/api/invites/join`                                    | Join by code                               | 2     |
| GET    | `/api/avatar`                                          | My style, look, traits and avatar          | 4     |
| POST   | `/api/avatar/photo`                                    | Upload my photo (consent) for my avatar    | 4     |
| POST   | `/api/avatar`                                          | Generate my avatar in my style (waits)     | 4     |
| GET    | `/api/pages/current`                                   | My page for this week (or null)            | 4     |
| PUT    | `/api/pages/current`                                   | Pick papers; creates the page              | 4     |
| GET    | `/api/pages/{pageId}`                                  | One of my pages                            | 4     |
| PATCH  | `/api/pages/{pageId}`                                  | Edit stories, comic title, captions, lines | 4     |
| POST   | `/api/pages/{pageId}/highlights`                       | Add a highlight (moderated)                | 4     |
| PUT    | `/api/pages/{pageId}/highlights/order`                 | Reorder highlights                         | 4     |
| POST   | `/api/pages/{pageId}/generate`                         | Write stories and the comic script         | 4     |
| POST   | `/api/pages/{pageId}/stories/{storyId}/rewrite`        | Rewrite one story                          | 4     |
| POST   | `/api/pages/{pageId}/panels/{index}`                   | Draw (or redraw) one panel; waits          | 4     |
| PUT    | `/api/pages/{pageId}/panels/order`                     | Reorder panels                             | 4     |
| POST   | `/api/pages/{pageId}/approve`                          | Approve for every linked paper             | 4     |
| GET    | `/api/highlights/{highlightId}`                        | One of my highlights                       | 4     |
| PATCH  | `/api/highlights/{highlightId}`                        | Edit, toggle serious or inComic            | 4     |
| DELETE | `/api/highlights/{highlightId}`                        | Delete a highlight                         | 4     |
| POST   | `/api/highlights/{highlightId}/photos`                 | Attach a photo                             | 4     |
| DELETE | `/api/photos/{photoId}`                                | Delete my photo (any time)                 | 4     |
| GET    | `/api/papers/{paperId}/editions`                       | This week's draft and back issues          | 4     |
| GET    | `/api/papers/{paperId}/editions/current`               | This week's edition (get or create)        | 4     |
| GET    | `/api/editions/{editionId}`                            | **Edition bundle**                         | 4     |
| POST   | `/api/editions/{editionId}/publish`                    | Publish after the deadline (owner)         | 4     |
| PUT    | `/api/editions/{editionId}/saved`                      | Keep forever, or undo (owner)              | 4     |
| PUT    | `/api/editions/{editionId}/stories/{storyId}/reaction` | React to a story                           | 4     |
| POST   | `/api/session/logout`                                  | Sign out everywhere; schedule purge        | 6     |
| GET    | `/api/internal/jobs`                                   | Cron only                                  | 4     |
| GET    | `/api/internal/cleanup`                                | Cron only                                  | 6     |

Full schemas are in `docs/openapi.yaml`. Key flows:

### Client call order

1. Onboarding: `PATCH /api/me` with name, `cityId` (from `/api/geocode`), birthday and `style`.
2. Avatar: optionally `POST /api/avatar/photo`, then `POST /api/avatar` with the trait form.
3. `PUT /api/pages/current` with the papers to post to. This returns the page.
4. Add 1 to 3 highlights with `POST /api/pages/{pageId}/highlights`, and photos to each.
5. `POST /api/pages/{pageId}/generate`. Then fire `POST /api/pages/{pageId}/panels/{0..3}` in parallel and
   render each panel as its image comes back. Overlay captions and dialogue from the page JSON; images
   never contain text.
6. Optional: edit text (`PATCH`), rewrite a story, redraw a panel, reorder panels.
7. `POST /api/pages/{pageId}/approve`. The page appears in every linked paper's edition.
8. After the deadline the owner publishes. Readers load `GET /api/editions/{editionId}`, which only reads
   stored results.

### Profile and onboarding

`PATCH /api/me` takes any of `{ "name", "cityId", "birthday", "style" }`. `cityId` comes from
`GET /api/geocode?q=Kumasi`; the server re-resolves it, so coordinates and timezone are never trusted from
the client, and coordinates are never returned. `style` is the person's comic style and defaults to
`classic`. Other members only ever see the month and day of a birthday, never the year or age.
`Profile.onboarded` is true once name, city, birthday, and an avatar in the current style exist.

### Avatars

- `POST /api/avatar/photo` (multipart `photo`, `photoConsent: "true"`) → `201 { photoUrl, expiresAt }`.
  Optional. The photo is moderated, stripped of metadata, used only for the caller's own avatar, and
  deleted within an hour. The app must ask for consent before uploading.
- `POST /api/avatar` with `{ "style"?, "traits"?, "photoUrl"? }` → `200 { avatarUrl, style, look }`.
  - `style` defaults to the profile's style; sending one also changes the profile's style.
  - `traits` is the trait form (`hairStyle`, `hairColor`, `skinTone`, `facialHair`, `glasses`,
    `headwear`, `top`, `topColor`, optional `note`). The server turns it into a fixed **look** text, for
    example "curly dark brown hair, round glasses, green hoodie", stores it, and reuses it word for word
    in every panel. Without `traits`, the stored look is used (`conflict` if there is none).
  - `photoUrl` must be one returned by `/api/avatar/photo` for this user. The server never fetches URLs.
  - Calling again regenerates the avatar, within the caps.

### Papers and invites

- Users can be in several papers. Papers hold at most **8** people. Papers have no style; each person has
  their own.
- `POST /api/papers/{paperId}/invites` returns `code` **once**: 6 Crockford base32 characters, such as
  `7KX2QM`. Only a hash is stored. Codes are multi-use, valid for 7 days, and revocable; at most 5 are
  active per paper.
- `POST /api/invites/join` with `{ "code" }` ignores case, spaces and dashes, and reads `O` as `0` and
  `I` or `L` as `1`. Unknown, expired and revoked codes all return the same `not_found`. A full paper
  returns `conflict`. Guessing is rate-limited per user and per IP.

### Pages

`PUT /api/pages/current` with `{ "paperIds": [...] }` (1 to 10 papers you belong to, each with an open
edition) creates this week's page if needed and links it to those papers. Calling it again changes the
list. `GET /api/pages/current` returns `{ page: null }` until then.

The page carries `deadline` (the **earliest** deadline among its papers, so one page never has two
lock times), `locked`, `papers` (each with its own edition and deadline), `status` (`writing`,
`generated`, `approved`), `highlights`, `stories`, `comic`, `notices`, and `limits`
(`regenerationsLeft`, `rewritesLeft`, `redrawsLeft`). After the deadline every write returns
`edition_locked`, except photo deletion.

### Highlights

`POST /api/pages/{pageId}/highlights` with `{ "text", "serious"?: false, "inComic"?: true }` →
`201 { highlight }`. Nothing is generated yet; the text is moderated.

- Blocked text returns `422 content_blocked` and nothing is saved.
- A sensitive topic (loss, illness, breakup, job loss) turns `serious` on and `inComic` off, with notice
  `marked_serious`. Serious highlights get a gentle story but never appear in the comic.
- More than 3 per page returns `conflict`. Editing or deleting a highlight marks the page `stale` and
  clears approval.

### Generating: `POST /api/pages/{pageId}/generate`

Request `{ "regenerate"?: false }` → `200 { page }`. Writes one story per highlight, in order, and a
4-panel comic script in the person's style. Panel images start as `pending`.

- Each story has a `section` (`news`, `sports`, `pets`, `campus`, `work`, `food`, `travel`, `arts`,
  `family`, `home`, `outdoors`, `milestones`), a `headline` and a 1 to 3 sentence `body`.
- `comic` is null when no highlight may go in the comic. Each panel has a `caption`, up to 2 dialogue
  lines (`{ text, side }`, spoken by the author), the `highlightId` it shows, its `photos`, and `image`
  (`{ status, url, error }`).
- If the model's output fails validation twice, safe default text built from the person's own words is
  stored with notice `fallback_used`. Edit it or regenerate.
- The stored page is returned as is unless `regenerate` is true.

### Editing, rewriting and redrawing

- `PATCH /api/pages/{pageId}` with `{ "stories"?: [{ id, headline?, body? }], "comic"?: { title?, panels?:
[{ index, caption?, dialogue?: [{ text }] }] } }` edits text. Edits are moderated and clear approval.
- `POST /api/pages/{pageId}/stories/{storyId}/rewrite` → `200 { story }` writes a clearly different story
  for that highlight.
- `POST /api/pages/{pageId}/panels/{index}` with `{ "regenerate"?: false }` → `200 { panel }`. Waits for the
  image (up to about 60 seconds). A ready panel is returned as is unless `regenerate` is true. Identical
  style, look and scene are cached and never paid for twice. A panel already being drawn returns
  `conflict`. On failure show a placeholder with a retry button.
- `PUT /api/pages/{pageId}/panels/order` with `{ "order": [2, 0, 1, 3] }` reorders panels (a permutation of
  0 to 3; `order[i]` is the old index of the panel now at `i`).

### Approving

`POST /api/pages/{pageId}/approve` → `200 { page }`. Needs generated content that isn't `stale` and no
panel still generating. The approved page is what every linked paper shows. Any later edit returns the
page to `generated`; approve again before the deadline.

### Photos

`POST /api/highlights/{highlightId}/photos` (multipart `photo`) → `201 { photo }`, up to 4 per highlight,
before the deadline. `DELETE /api/photos/{photoId}` works at any time, including after publishing.

### Editions and the bundle

- `GET /api/papers/{paperId}/editions` lists this week's draft and the back issues, newest first, with
  `issueNumber`, `deadline`, `status`, `publishedAt`, `expiresAt` and `savedAt`.
- `GET /api/editions/{editionId}` returns everything the paper needs, with short-lived signed URLs:
  `edition` (with `paperName`), `viewer`, `members` (name, city, zodiac sign, style, avatar, role),
  `progress` (each member's page status, no content), `pages` (published editions only: each author's
  stories with reactions, and comic), `horoscopes` (one per sign present, with a `luckyNumber` 1 to 99
  computed by the server, the same for everyone with that sign that week), `birthdays` (month and day
  only), and `urlsExpireAt`.
- **Drafts are private.** Before publishing, members see only progress, never anyone else's page.

### Publishing, saving and reactions

- `POST /api/editions/{editionId}/publish` is owner only and only after the deadline. Every approved page
  goes in; failed panels publish as placeholders.
- `PUT /api/editions/{editionId}/saved` with `{ "saved": true }` keeps a published edition forever, for
  every member. Owner only. `false` restores the 14-day expiry, counted from publishing.
- `PUT /api/editions/{editionId}/stories/{storyId}/reaction` with `{ "reaction": "ha" | "aww" | "hooray" |
null }` → `{ reactions: { ha, aww, hooray }, myReaction }`. One reaction per member per story; counts
  are per edition.

### Weather: `GET /api/weather`

Send `lat` and `lon` from the browser's location (rounded to 2 decimals is fine), or neither to use the
profile city. The server rounds coordinates to about 10 km, never stores or logs them, and asks Open-Meteo
for current conditions and up to 7 days. Returns `{ weather: { source, place, timezone, fetchedAt,
current, days } }`, or `{ weather: null }` without location or city. The browser never calls a weather
service directly.

### Logout and retention

Call `POST /api/session/logout` **before** clearing the local Supabase session. It signs out everywhere.

- **Draft posts** (pages, highlights, stories, panels, photos before publishing) are hidden immediately
  and deleted after 24 hours unless the user signs back in.
- **Published editions** are deleted 14 days after publishing, unless the owner saved them.
- While signed in, activity keeps draft posts alive on a 30-day sliding window.
- The profile, look and avatar are kept. Avatar photos are deleted within an hour.

## AI layer (server-side only, for reference)

Routes call a vendor-neutral `AiService` (`src/lib/ai`). A thin `AiProvider` underneath is the only code
that knows a vendor, selected by `AI_PROVIDER=stub|real`. Moderation is a separate `Moderator`
(`MODERATION_PROVIDER=stub|real`) for text and images. Definitions are in `src/lib/ai/types.ts`.

```ts
interface AiService {
  checkHighlight(i: { text }, ctx): Promise<{ serious: boolean; moderation }>;
  checkPhoto(i: { image }, ctx): Promise<void>;
  checkEdit(i: { text; field }, ctx): Promise<void>;
  describeLook(i: { traits }, ctx): Promise<{ look: string }>;
  generateAvatar(i: { look; photo?; style: StyleConfig }, ctx): Promise<ImageBytes>;
  writePage(i: { weekLabel; author: { userId; name; city? }; highlights }, ctx): Promise<PageResult>;
  rewriteStory(i: { weekLabel; author; highlight; previousHeadline? }, ctx): Promise<{ story; usedFallback }>;
  generatePanel(
    i: { scene; character: { name; look; avatar? }; style: StyleConfig },
    ctx,
  ): Promise<ImageBytes>;
  generateHoroscope(i: { sign; weekStart }, ctx): Promise<string>;
}

interface AiProvider {
  completeJson(
    req: { task: "page" | "story" | "horoscope"; system; user; jsonSchema; maxOutputTokens },
    ctx,
  ): Promise<{ raw; meta }>;
  generateImage(
    req: { task: "avatar" | "panel"; prompt; references: ImageBytes[]; aspectRatio: "1:1" | "4:3"; style },
    ctx,
  ): Promise<{ image; meta }>;
}
```

What `writePage` does:

1. Cleans each highlight and redacts emails, links and phone numbers (the city too). The name becomes a
   letters-only first name. Highlights are sent as short refs (`h1`), never real ids.
2. Builds the prompt: a fixed system prompt, then the name, city and each highlight inside delimiters
   with a random per-call id, marked `comic: yes/no` and `tone: light/serious`.
3. Validates the output: strict schema (code fences stripped), one story per highlight in order, known
   sections, length limits, no exclamation marks in serious stories, exactly 4 panels from comic-eligible
   highlights, at most 2 lines of 12 words, captions of 15 words, scenes without quoted text, plain text
   with no links or markup, and grounding (no names or numbers that aren't in the input). One retry.
4. Moderates the generated text. If validation fails twice or the output is blocked, returns safe default
   text built from the person's own words with neutral scenes, and sets `usedFallback`.

Images: avatar and panel prompts are fixed templates (look, style fragment, "do not draw any text", space
at the top for bubbles), with every field reduced to safe characters. Avatars use the photo as a reference
only when one was given; panels use only the author's own avatar. Scenes are moderated before any image
call. Images are checked by their bytes, with one retry.

Every call has a deadline (`AI_TIMEOUT_MS`), shares a concurrency cap (`AI_MAX_CONCURRENCY`), runs behind a
circuit breaker (`AI_CIRCUIT_*`), and counts toward per-user daily caps. Moderation failures fail closed.
Calls are logged as metadata only.

## Changelog

- **0.5.0 (Phase 3, aligned with the web app):**
  - Each person writes **one page per week**: one story per highlight (with a `section`) and a 4-panel
    comic starring only them. This replaces the group story. New `/api/pages/*` routes. `/api/story`,
    `/api/panel`, `POST /api/highlights` and `PUT /api/editions/{editionId}/order` are gone.
  - A page can go to several papers; it locks at the earliest deadline (Sunday 11:59 p.m. in each owner's
    timezone). The owner publishes after the deadline.
  - Style belongs to the person (`PATCH /api/me` `style`), not the paper. One avatar, in that style.
    `POST /api/avatar` no longer takes `person`.
  - Invite codes are 6 characters; `O`, `I` and `L` are read as `0`, `1`, `1`. Joining is limited per IP.
  - Reactions (`ha`, `aww`, `hooray`), saving editions forever (owner), server-computed lucky numbers, and
    back issues kept 14 days.
  - Weather moved out of the bundle into `GET /api/weather` (browser location or profile city).
- **0.4.0 (Phase 3, aligned with the comic pipeline handoff):**
  - Responses are bare JSON. Errors are `{ error: "message", code, requestId, details?, retryAfterSeconds? }`
    instead of `{ data }` and `{ error: { code, message, … } }`.
  - One article and one 4-panel comic per edition, written from everyone's approved highlights, replace
    per-highlight articles and panels. `/api/events/*` became `/api/highlights/*`.
  - New `POST /api/story`, `GET`/`PATCH /api/story`, and `POST /api/panel` (waits for the image) in the
    handoff's shapes, plus `editionId`; panels carry `sources` (highlight ids) and `photos`.
  - Avatars: `POST /api/avatar/photo` (optional photo, with consent) and `POST /api/avatar`
    `{ style, person, photoUrl? }` → `{ avatarUrl }`, one avatar per style, built from a stored look text.
    The regenerate and approve routes are gone.
  - Papers have a `style` (`classic`, `manga`, `sketch`, `superhero`). Papers hold at most 8 people.
  - CORS for the web app's origins (`CORS_ALLOWED_ORIGINS`).
- **0.3.0 (Phase 3):** the AI layer and safety checks behind the stub provider. `content_blocked` errors
  include `details`; self-harm uses a fixed supportive message.
- **0.2.0 (Phase 2):** auth, profile, papers and invites are live. `Member.name` is nullable; at most 5
  active invites per paper; unknown, expired and revoked codes return the same `404`.
- **0.1.0 (Phase 0):** initial contract.
