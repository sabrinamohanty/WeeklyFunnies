# Meanwhile API contract

Version 0.4.0 (Phase 3). This is the contract the web app builds against. It follows the comic pipeline
handoff (`/api/story`, `/api/avatar`, `/api/panel`, bare JSON responses, `{ "error": "message" }`).

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
| `forbidden`            | 403  | Signed in and a member, but not allowed (e.g. non-owner generating)       |
| `not_found`            | 404  | Doesn't exist **or** you can't see it (we never reveal which)             |
| `method_not_allowed`   | 405  | Wrong HTTP method for this path (`Allow` header lists valid ones)         |
| `conflict`             | 409  | Conflicts with current state (e.g. 4th highlight, stale panel echo)       |
| `edition_locked`       | 409  | Edition is published; edits are blocked                                   |
| `payload_too_large`    | 413  | Body or file over the limit                                               |
| `unsupported_media`    | 415  | Wrong content type or file type                                           |
| `content_blocked`      | 422  | Moderation blocked the text or photo. Show the message; let the user edit |
| `rate_limited`         | 429  | Too many requests; wait `retryAfterSeconds`                               |
| `quota_exceeded`       | 429  | Daily or per-edition generation cap reached                               |
| `internal`             | 500  | Unexpected server error                                                   |
| `not_implemented`      | 501  | Route exists but its phase isn't built yet                                |
| `provider_unavailable` | 503  | AI provider is down, timed out, or the circuit breaker is open; retry     |

**Self-harm.** Text about self-harm or crisis is blocked with a fixed supportive `error` message and
`details: [{ "path": "body.text", "issue": "self_harm_support" }]`. Show the message with support resources
whenever you see `self_harm_support`. Other blocks use issue `content_blocked`.

### Data rules

- **Strict input.** Unknown fields, unknown query parameters, and bodies on routes that take none are all
  rejected with `bad_request`.
- **Ids from the client are never trusted.** Any `editionId`, person id, or highlight id is checked against
  the database (membership, then ownership). The handoff's echo fields (`people`, `highlights`, `panel`,
  `person.look`) are optional; if sent, their ids must match, and the server always uses its stored data.
- **Ids** are UUIDs. **Timestamps** are ISO 8601 with offset. **Dates** are `YYYY-MM-DD`.
- **Text cleaning.** All text input is normalized to NFC, stripped of control and invisible characters
  (ZWJ and ZWNJ are kept for emoji and scripts), whitespace is normalized, and the result is trimmed.
  Lengths count Unicode code points **after** cleaning. Responses return the cleaned value.
- **Render all text as plain text**, including headlines, captions, dialogue and names. Never as HTML.
- **Signed URLs** expire (default 10 minutes). Refetch after `urlsExpireAt`; don't persist URLs. Storage
  paths are never exposed.

| Field                         | Limit                       |
| ----------------------------- | --------------------------- |
| Person name, paper name       | 1 to 60 code points         |
| Highlight text                | 1 to 500 code points        |
| Highlights per person         | 1 to 3 per edition          |
| Photos per highlight          | up to 4                     |
| People per paper              | up to 8                     |
| Headline / title / body edits | 120 / 80 / 1,500            |
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
uploads and joining. Generation also has per-user daily caps and per-edition regeneration caps
(`quota_exceeded`).

## Endpoints

| Method | Path                                       | Purpose                                          | Phase |
| ------ | ------------------------------------------ | ------------------------------------------------ | ----- |
| GET    | `/api/health`                              | Liveness (no auth)                               | 0     |
| GET    | `/api/me`                                  | Caller's profile                                 | 2     |
| PATCH  | `/api/me`                                  | Set name, city, birthday (onboarding)            | 2     |
| GET    | `/api/geocode?q=`                          | City candidates for onboarding                   | 2     |
| GET    | `/api/papers`                              | My papers                                        | 2     |
| POST   | `/api/papers`                              | Create a paper with a style (caller is owner)    | 2     |
| GET    | `/api/papers/{paperId}`                    | Paper and contributor list                       | 2     |
| PATCH  | `/api/papers/{paperId}`                    | Rename or change style (owner)                   | 2     |
| GET    | `/api/papers/{paperId}/invites`            | List invites (owner; no codes)                   | 2     |
| POST   | `/api/papers/{paperId}/invites`            | Create invite code (owner)                       | 2     |
| DELETE | `/api/papers/{paperId}/invites/{inviteId}` | Revoke invite (owner)                            | 2     |
| POST   | `/api/invites/join`                        | Join by code                                     | 2     |
| GET    | `/api/avatar`                              | My look, traits, and avatars per style           | 4     |
| POST   | `/api/avatar/photo`                        | Upload my photo (consent) for my avatar          | 4     |
| POST   | `/api/avatar`                              | Generate my avatar in a style (waits)            | 4     |
| GET    | `/api/papers/{paperId}/editions`           | Editions list                                    | 4     |
| GET    | `/api/papers/{paperId}/editions/current`   | This week's draft (get or create)                | 4     |
| GET    | `/api/editions/{editionId}`                | **Edition bundle**                               | 4     |
| POST   | `/api/highlights`                          | Add a highlight (moderated)                      | 4     |
| GET    | `/api/highlights/{highlightId}`            | My highlight                                     | 4     |
| PATCH  | `/api/highlights/{highlightId}`            | Edit, toggle serious/inComic, approve            | 4     |
| DELETE | `/api/highlights/{highlightId}`            | Delete my highlight                              | 4     |
| POST   | `/api/highlights/{highlightId}/photos`     | Attach a photo                                   | 4     |
| DELETE | `/api/photos/{photoId}`                    | Delete my photo (any time)                       | 4     |
| PUT    | `/api/editions/{editionId}/order`          | Reorder my highlights                            | 4     |
| POST   | `/api/story`                               | Write the group article + 4-panel script (owner) | 4     |
| GET    | `/api/story?editionId=`                    | Read the stored story                            | 4     |
| PATCH  | `/api/story`                               | Edit headline, body, captions, dialogue (owner)  | 4     |
| POST   | `/api/panel`                               | Draw one panel (owner; waits for the image)      | 4     |
| POST   | `/api/editions/{editionId}/publish`        | Publish (owner)                                  | 4     |
| POST   | `/api/session/logout`                      | Sign out everywhere; schedule purge              | 6     |
| GET    | `/api/internal/jobs`                       | Cron only                                        | 4     |
| GET    | `/api/internal/cleanup`                    | Cron only                                        | 6     |

Full schemas are in `docs/openapi.yaml`. Key flows:

### Client call order (from the handoff)

1. The owner picks the paper's style (`POST /api/papers` or `PATCH /api/papers/{paperId}` with `style`:
   `classic`, `manga`, `sketch`, or `superhero`).
2. Each person creates their avatar in that style with `POST /api/avatar`.
3. Each person adds 1 to 3 highlights (`POST /api/highlights`) and approves them.
4. The owner calls `POST /api/story`, then fires one `POST /api/panel` per panel (indexes 0 to 3) in
   parallel and renders each panel as its image comes back.
5. The client overlays captions and dialogue bubbles from the story JSON. Images never contain text.
6. The owner publishes. Page loads only read stored results (`GET /api/editions/{editionId}`).

### Profile and onboarding

`PATCH /api/me` takes any of `{ "name", "cityId", "birthday" }`. `cityId` comes from
`GET /api/geocode?q=Kumasi`; the server re-resolves it, so coordinates and timezone are never trusted from
the client, and coordinates are never returned. Other members only ever see the month and day of a
birthday. `Profile.onboarded` is true once name, city, birthday, and an avatar exist.

### Avatars

- `POST /api/avatar/photo` (multipart `photo`, `photoConsent: "true"`) → `201 { photoUrl, expiresAt }`.
  Optional. The photo is moderated, stripped of metadata, used only for the caller's own avatar, and
  deleted within an hour.
- `POST /api/avatar` with `{ "style", "person": { "id", "traits"? }, "photoUrl"? }` →
  `200 { avatarUrl, style, look }`.
  - `person.id` must be the caller (`forbidden` otherwise).
  - `traits` is the trait form (`hairStyle`, `hairColor`, `skinTone`, `facialHair`, `glasses`,
    `headwear`, `top`, `topColor`, optional `note`). The server turns it into a fixed **look** text, for
    example "curly dark brown hair, round glasses, green hoodie", stores it, and reuses it word for word
    in every panel. Without `traits`, the stored look is used (`conflict` if there is none).
  - `photoUrl` must be one returned by `/api/avatar/photo` for this user. The server never fetches URLs.
  - The avatar is saved for that style (one per style) and is also the self preview. Calling again
    regenerates it, within the caps.

### Papers and invites

- A paper has a `style`. Users can be in several papers. Papers hold at most **8** people.
- `POST /api/papers/{paperId}/invites` returns `code` **once** (`XXXX-XXXX-XXXX`, 12 Crockford base32
  characters). Only a hash is stored. Codes are multi-use, valid for 7 days, and revocable; at most 5 are
  active per paper.
- `POST /api/invites/join` with `{ "code" }` ignores case, spaces and dashes. Unknown, expired and revoked
  codes all return the same `not_found`. A full paper returns `conflict`. Guessing is rate-limited.

### Highlights

`POST /api/highlights` with `{ "editionId", "text", "serious": false }` → `201 { highlight }`. Nothing is
generated yet; the text is moderated.

- Blocked text returns `422 content_blocked` and nothing is saved.
- A sensitive topic (loss, illness, breakup, job loss) turns `serious` on and `inComic` off, with notice
  `marked_serious`. Serious highlights can appear gently in the article but never in the comic.
- Only **approved** highlights go into the story. More than 3 per person returns `conflict`.

### Story: `POST /api/story` (owner only)

Request: `{ "editionId", "people"?, "highlights"?, "regenerate"?: false }`. `people` (`{ id, name?, look? }`)
and `highlights` (`{ personId, id?, text? }`) are optional echoes from the handoff; ids must belong to the
edition, and the stored members and approved highlights are always what's used.

Response (the handoff schema plus server fields):

```json
{
  "editionId": "…",
  "article": { "headline": "…", "byline": "Ama", "bylineUserId": "…", "body": "Para 1\n\nPara 2\n\nPara 3" },
  "comic": {
    "title": "…",
    "panels": [
      {
        "index": 0,
        "scene": "…",
        "caption": "…",
        "dialogue": [{ "speaker": "Ama", "speakerUserId": "…", "text": "…", "side": "left" }],
        "characters": ["<userId>"],
        "sources": ["<highlightId>"],
        "imageUrl": null,
        "image": { "status": "pending", "url": null, "error": null },
        "photos": ["<signed url>"]
      }
    ]
  },
  "notices": [],
  "regenerationsLeft": 4,
  "generatedAt": "…"
}
```

- `comic` is null when no approved highlight may go in the comic (all serious).
- `sources` are the highlights each panel shows; `photos` are their attached photos (show the
  `PhotoCount` badge when nonzero).
- If the model's output fails validation twice, a safe default story built from everyone's own words is
  stored, with notice `fallback_used`. Edit it or regenerate.
- `stale` means approved highlights changed after generation; regenerate before publishing.
- `GET /api/story?editionId=` returns the stored story. Drafts: owner only. Published: every member.
- `PATCH /api/story` with `{ "editionId", "headline"?, "body"?, "title"?, "panels"? }` edits text
  (moderated). Panel edits change captions and dialogue text only.

### Panels: `POST /api/panel` (owner only)

Request: `{ "editionId", "index", "style"?, "panel"?, "people"?, "regenerate"?: false }` →
`200 { imageUrl, editionId, index, status: "ready" }`.

- The server draws the **stored** panel `index`. If `style` is sent it must equal the paper's style; if
  `panel` is sent, its `scene` and `characters` must match the stored panel (`conflict` otherwise).
- The request waits for the image (up to about 60 seconds). Fire all four in parallel.
- A ready panel is returned as is unless `regenerate` is true. Identical style, cast, and scene are cached
  and never paid for twice. A panel already being drawn by another request returns `conflict`.
- Each panel's status (`pending`, `generating`, `ready`, `failed`) is stored, so a reload shows the right
  state. On failure show a clean placeholder with a retry button; one bad panel never breaks the paper.

### Photos

`POST /api/highlights/{highlightId}/photos` (multipart `photo`) → `201 { photo }`, up to 4 per highlight,
drafts only. `DELETE /api/photos/{photoId}` works at any time, including after publishing.

### Edition bundle: `GET /api/editions/{editionId}`

Everything the page needs, with short-lived signed URLs: `edition` (with `paperName` and `style`),
`viewer`, `members` (name, city, zodiac sign, avatar in the paper's style, role), `myHighlights`,
`progress` (each member's status, no content), `story` (owner only in drafts; everyone once published),
`weather` (the reader's own city), `horoscopes`, `birthdays` (month and day only), and `urlsExpireAt`.

- **Drafts are private.** Members see their own highlights and everyone's progress status, never other
  members' text. Row-level security enforces the same rule.
- Weeks run Monday to Sunday in the paper owner's timezone.

### Publishing

`POST /api/editions/{editionId}/publish` is owner only. It requires a story that isn't `stale` and no
panel still generating; failed panels publish as placeholders. After publishing, edits return
`edition_locked`, except photo deletion.

### Logout and retention

Call `POST /api/session/logout` **before** clearing the local Supabase session. It signs out everywhere.

- **Draft posts** (highlights, story, panels, photos in unpublished editions) are hidden immediately and
  deleted after 24 hours unless the user signs back in.
- **Posts in a published edition** are deleted 30 days after that edition was published.
- While signed in, activity keeps draft posts alive on a 30-day sliding window.
- The profile, look and avatars are kept. Avatar photos are deleted within an hour.

## AI layer (server-side only, for reference)

Routes call a vendor-neutral `AiService` (`src/lib/ai`). A thin `AiProvider` underneath is the only code
that knows a vendor, selected by `AI_PROVIDER=stub|real`. Moderation is a separate `Moderator`
(`MODERATION_PROVIDER=stub|real`) for text and images. Definitions are in `src/lib/ai/types.ts`.

```ts
interface AiService {
  checkHighlight(i: { text }, ctx): Promise<{ serious: boolean; moderation }>;
  checkPhoto(i: { image }, ctx): Promise<void>;
  describeLook(i: { traits }, ctx): Promise<{ look: string }>;
  generateAvatar(i: { look; photo?; style: StyleConfig }, ctx): Promise<ImageBytes>;
  writeStory(
    i: { weekLabel; people: { userId; name }[]; highlights: StoryHighlight[] },
    ctx,
  ): Promise<Story & { usedFallback }>;
  generatePanel(
    i: { scene; characters: { name; look; avatar? }[]; style: StyleConfig },
    ctx,
  ): Promise<ImageBytes>;
  generateHoroscope(i: { sign; weekStart }, ctx): Promise<string>;
}

interface AiProvider {
  completeJson(
    req: { task: "story" | "horoscope"; system; user; jsonSchema; maxOutputTokens },
    ctx,
  ): Promise<{ raw; meta }>;
  generateImage(
    req: { task: "avatar" | "panel"; prompt; references: ImageBytes[]; aspectRatio: "1:1" | "4:3"; style },
    ctx,
  ): Promise<{ image; meta }>;
}
```

What `writeStory` does:

1. Cleans each highlight and redacts emails, links and phone numbers. Names become letters-only first names
   (duplicates get an initial). People and highlights are sent as short refs (`p1`, `h1`), never real ids.
2. Builds the handoff's story prompt: a fixed system prompt, and each name and highlight inside delimiters
   with a random per-call id, marked `comic: yes/no` and `tone: light/serious`.
3. Validates the output: strict schema (code fences stripped), byline is a provided name, 3 to 5
   paragraphs, exactly 4 panels, at most 2 lines of 12 words, captions of 15 words, scenes without quoted
   text, characters and speakers from the list, moments from comic-eligible highlights, plain text with no
   links or markup, and grounding (no names or numbers that aren't in the highlights). One retry.
4. Moderates the generated text. If validation fails twice or the output is blocked, returns a safe default
   story built from everyone's own words with neutral scenes, and sets `usedFallback`.

Images: avatar and panel prompts are the handoff's fixed templates (look, style fragment, "do not draw any
text", space at the top for bubbles), with every field reduced to safe characters. Avatars use the photo as
a reference only when one was given; panels use the avatars of the characters in frame. Scenes are
moderated before any image call. Images are checked by their bytes, with one retry.

Every call has a deadline (`AI_TIMEOUT_MS`), shares a concurrency cap (`AI_MAX_CONCURRENCY`), runs behind a
circuit breaker (`AI_CIRCUIT_*`), and counts toward per-user daily caps. Moderation failures fail closed.
Calls are logged as metadata only.

## Changelog

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
