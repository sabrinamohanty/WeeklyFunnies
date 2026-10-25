# Meanwhile backend: working notes

## Status

| Phase                              | State       |
| ---------------------------------- | ----------- |
| 0. Scaffold and contract           | Done        |
| 1. Database, storage, RLS          | Done        |
| 2. Auth, papers, membership        | Done        |
| 3. AI placeholder layer and safety | Done        |
| 4. Core routes and data            | Done        |
| 5. Weather, birthdays, horoscopes  | Not started |
| 6. Retention                       | Not started |
| 7. Seed data and frontend check    | Not started |
| 8. Real AI providers               | Not started |

The README has the detailed list of what each remaining phase covers.

## Setup

```sh
corepack enable            # or prefix commands with: npx pnpm@10.34.8
pnpm install
cp .env.example .env.local # fill in values; local Supabase keys come from `pnpm supabase status`
pnpm db:start              # local Supabase in Docker (needed from Phase 1)
pnpm dev
```

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `pnpm test`             | Unit and AI tests (no external services)                  |
| `pnpm test:integration` | Integration tests against local Supabase                  |
| `pnpm check`            | Typecheck, lint, format check, OpenAPI drift check, tests |
| `pnpm openapi`          | Regenerate `docs/openapi.yaml` from `src/lib/contract`    |

## Layout

- `src/app/api/**/route.ts`: thin route files. Each wraps a contract entry with `defineRoute`.
- `src/lib/contract/`: Zod schemas and the route registry (`routes.ts`). The single source for validation,
  OpenAPI, and route-coverage tests.
- `src/lib/http/`: the request pipeline (`defineRoute`), body limits, and the error shape.
- `src/proxy.ts`: the CORS allowlist, and JSON 404 and 405 for unknown paths and methods.
- `src/lib/config/env.ts`: environment schema. It fails fast on boot and errors name keys, never values.
- `src/lib/ai/`: `AiService` (`service.ts`), interfaces (`types.ts`), timeouts, concurrency and circuit
  breaker (`resilience.ts`), and providers: `providers/stub/` (deterministic) and `providers/real/` (the
  vendor plug-in point, not integrated yet).
- `src/lib/ai/styles.ts`: the four art style presets (design owns the text).
- `src/lib/safety/`: redaction, delimiters, prompt templates, the look builder, output validation,
  grounding, fallbacks.
- `src/lib/log/`: metadata-only JSON logger with key-based redaction.
- `tests/fixtures/text-cases.ts`: shared text cases for every text route and the AI safety layer.
- `supabase/migrations/`: schema (`…0100`), grants and row-level security (`…0200`), buckets and storage
  policies (`…0300`).
- `supabase/migrations/…0400`: the rate-limit table and the `create_paper` and `join_paper` functions
  (service role only).
- `src/lib/db/`, `src/lib/papers/`, `src/lib/profile/`, `src/lib/pages/`, `src/lib/editions/`,
  `src/lib/avatar/`, `src/lib/geo/`, `src/lib/time/`: the service-key client, repos, invite codes,
  week/deadline helper, and the Open-Meteo geocoder.
- `tests/ai/`: the full text-case suite through highlight moderation, the page writer, name and city fields, failure paths, and safety
  unit tests. `live.test.ts` runs only with `AI_LIVE_TESTS=1`.
- `tests/integration/`: two-user table tests, storage tests, database invariant tests, and API tests for
  `me`, papers, invites, joining, pages, avatars, editions, and reactions.

## Auth and papers (Phase 2)

- **Auth:** every user route verifies the bearer token with Supabase Auth (`auth.getUser`), so tokens from
  signed-out sessions and deleted users get `401`. If Supabase Auth itself is down, the API returns `500`
  rather than letting the request through.
- **Authorization order:** signed in, then member of the paper, then owner where needed. Papers you're not
  in return `404` (never `403`), so ids can't be probed. Members hitting owner-only routes get `403`.
- **Invite codes:** 6 Crockford base32 characters (30 bits) from a secure random source, shown once. Only
  an HMAC-SHA256 hash with `INVITE_CODE_PEPPER` is stored. Input ignores case, spaces and dashes and reads
  `O` as `0`, `I` and `L` as `1`. At most 5 active invites per paper. Unknown, expired and revoked codes
  all give the same `404`. Joining is limited to 5 attempts a minute per user and 20 per IP, and codes
  expire in 7 days, which keeps guessing a live code impractical. A new code is regenerated if its hash
  matches an invite that is still usable; expired codes may be reused (migration `…0600` dropped the
  unique constraint on the hash).
- **Profile city:** the app sends a geocode id; the server looks it up and stores name, country, timezone
  and coordinates. Coordinates are never returned.
- **Rate limits:** stored in Postgres (`RATE_LIMIT_STORE=postgres`), keyed by a sha256 hash, so limits
  are shared across serverless instances. If the store is unreachable, requests are allowed and a
  warning is logged (fail open).
- **New env vars:** `INVITE_CODE_PEPPER` (required, at least 32 chars), `RATE_LIMIT_STORE`, and
  `RATE_LIMIT_ROUTE_SCALE` (tests only; config refuses anything but 1 in production).

## AI layer (Phase 3, aligned with the web app)

Contract 0.5.0 follows the web app (`WeeklyFunnies-frontend`) where it differs from the comic pipeline
handoff. What changed and why:

- **One page per person per week.** Each person's page has one story per highlight (section, headline,
  body) and a 4-panel comic starring only them. Highlights are moderated when written and generate
  nothing on their own. The handoff's single group article per edition is gone, because the app shows
  each friend's stories and strip separately and lets them rewrite a story or redraw a panel.
- **One page, several papers.** A person picks which papers a page goes to. It's generated and edited
  once and appears in each. It locks at the **earliest** linked deadline, so there's one lock time.
- **Styles per person.** Each person picks `classic`, `manga`, `sketch`, or `superhero` on their profile;
  the fragment is added to their avatar and panel prompts. `AI_STYLE_ID` is gone.
- **Looks.** The trait form becomes a fixed look text, stored and reused word for word in every panel.
  Avatars come from the look alone or the look plus an optional photo (moderated, own avatar only).
- **Speech is never drawn.** Captions and dialogue come back as JSON and the client overlays them.
- **Server-authoritative.** Panel routes take only an index; the stored scene, look and style are always
  what's used, so a client can't send its own scene to the image model. Edited text is moderated
  (`checkEdit`).

Safety pipeline (details in `docs/api-contract.md` under "AI layer"):

- User text is redacted (emails, links, phones), moderated, and sent only inside delimiters with a random
  per-call id. The city is redacted the same way. Highlights go to the model as `h1` refs, never real ids.
  System prompts are constants.
- Output must match a strict schema (code fences stripped) and pass checks: one story per highlight in
  order, known sections, lengths, no exclamation marks in serious stories, 4 panels from comic-eligible
  highlights, word limits, no quoted text in scenes, plain text, and grounding. Headlines are asked for in
  sentence case, because grounding treats capitalized words as names. One retry, then safe fallback
  text built from the person's own words. Generated text is moderated too.
- Image prompts are the handoff's fixed templates, with fields reduced to safe characters. Scenes are
  moderated before any image call. Photos are moderated before use.
- Deadlines, a concurrency cap, circuit breakers, per-user daily caps, a panel cache key (style, look and
  scene), and metadata-only logs.

Deviations from the handoff, on purpose:

- **Per-person pages instead of one group story,** and per-person styles instead of per-paper (see above).
- **Fallback instead of 502.** The handoff returns 502 after one retry. The original brief asks for a safe
  default, so the server stores fallback text marked `fallback_used` that the author can edit or
  regenerate. Provider outages and timeouts still return `503 provider_unavailable`.
- **`highlightId` on panels** so photos pin to panels automatically.
- **`photoUrl` must be ours.** Avatar photos are uploaded through `POST /api/avatar/photo`; the server
  never fetches a client-supplied URL.
- **Error responses** keep `code` and `requestId` next to the handoff's `error` string.

## Database (Phase 1)

Phase 3 migration `…0500` added looks and an 8-member cap. Phase 4 migration `…0700` dropped `events`
and added `pages`, `page_papers`, `highlights`, `stories`, `panels`, and `reactions`, plus
`editions.saved_at` and `editions.issue_number`. Style lives on the profile (`…0600`).

Tables: `profiles`, `avatar_drafts`, `papers`, `paper_members`, `invites`, `editions`, `pages`,
`page_papers`, `highlights`, `photos`, `stories`, `panels`, `reactions`, `horoscopes`, and
`storage_deletions`. Helper functions live in a private `app` schema that the REST API doesn't expose.

Differences from the original data model table:

- **`users` is named `profiles`**, to avoid confusion with Supabase's `auth.users`. It's keyed by the auth
  user id and created automatically when a user signs up.
- **A page is per person per week**, linked to papers through `page_papers`. Photo and panel paths are
  `{user_id}/{uuid}.ext`.
- **New `avatar_drafts` table** (server only) holds the selfie path, trait form, and draft avatar.
- **New `storage_deletions` outbox.** Deleting or replacing any row that points at a file queues that file
  here automatically. The Phase 6 purge worker removes the files, so rows and files stay in sync and
  purges can be retried safely.

What the database enforces for every role, including the service key the API uses:

- Published editions are read-only: no new highlights, photos, or stories, and no content or approval
  changes. A panel can still finish generating, and publishing can't be undone. Deadline lock is
  timezone-aware and enforced in the API.
- Limits: at most 3 highlights per page, 4 photos per highlight, 4 panels, and 8 members per paper.
  Weeks must start on a Monday.
- Storage paths must sit inside the author's own folder.
- Text lengths match the API limits. The zodiac sign is derived from the birthday.

What app roles can do directly (defense in depth; the app is meant to go through the API):

- **Reads:** only rows the rules allow, and only non-sensitive columns. Storage paths, source text,
  birthdays, coordinates, session fields and invite hashes are never readable directly.
- **Writes:** none, except deleting your own photos, which is allowed at any time. All other writes need
  the API's validation and moderation.
- **Storage:** reads mirror table visibility. There are no direct uploads, overwrites or deletes, and
  selfies are server only.

## Decisions (agreed)

- **Stack:** Next.js 16 route handlers on Vercel; Supabase for Auth, Postgres, and Storage; Zod 4; Vitest;
  pnpm. TypeScript is pinned to 6.0 because typescript-eslint doesn't support 7.x yet.
- **Frontend:** a separate web app on its own origin, allowed by an exact-origin CORS list.
- **Auth:** the app uses Supabase Auth directly. The API verifies the bearer token, so there's no sign-in
  route.
- **Jobs:** a Postgres jobs table with `SKIP LOCKED`, kicked off with `after()`, plus a cron sweep.
- **Rate limits:** Postgres-backed, behind the `RateLimiter` interface.
- **Uploads:** through the API. The app converts HEIC to JPEG (about 2048 px, under 4 MB on the wire) and
  the server caps files at 12 MB.
- **Retention:**
  - drafts use a 30-day sliding window;
  - logout signs out everywhere, hides drafts immediately, and purges them after 24 hours unless the user
    signs back in;
  - **published editions are deleted 14 days after publishing**, regardless of logout, unless the owner
    saved the edition (kept forever, for every member);
  - the avatar is part of the profile and is kept;
  - the selfie is kept until avatar approval, 1 hour at most.
- **Papers:** a user can be in several papers. Weeks start Monday in the owner's timezone and close at
  the deadline, Sunday 11:59 p.m. in that timezone. Each member approves their own page; the owner
  publishes manually after the deadline.
- **Reactions:** `ha`, `aww`, `hooray`; one per member per story, counted per edition.
- **Lucky numbers:** computed by the server from the sign and week (`src/lib/editions/lucky.ts`), 1 to 99,
  never generated by a model.
- **Invites:** multi-use codes with a 7-day expiry, revocable, stored hashed, with an 8-member cap.
- **Profile:** full birthday stored, but only month and day are ever shown to others. The user picks a
  city from geocode candidates.
- **Weather:** `GET /api/weather` from Open-Meteo. The browser's location first (sent as `lat`/`lon`),
  then the profile city. Coordinates are rounded to about 10 km and never stored or logged.
- **Limits:** 1 to 3 highlights per page, 4 photos per highlight, 500 characters per highlight, up to 10
  papers per page. Per page: 5 regenerations, 10 story rewrites, 12 panel redraws.
- **Moderation:** self-harm and crisis content is blocked with a supportive message. Other sensitive
  topics force `serious` on.
- **AI layer:** an `AiService` (safety lives here) over a thin `AiProvider`. One page per person per week,
  style and look per person, photo optional. Real vendors (Anthropic, Meta Muse Image) come in Phase 8.
  A lint rule blocks vendor SDK imports outside `src/lib/ai/providers/real/`.
- **Draft visibility:** in a draft, members see only their own page, plus each member's progress status.
  Others' pages appear after publishing. The bundle and row-level security both enforce this.
- **Age:** no minimum age is enforced for now.
- **Photo captions:** none. Photos are images only. The "injection in a caption" test applies to name
  fields instead.
- **Account deletion:** deferred. There are no App Store submission plans for now, so it isn't blocking.

## Open questions

None right now.

## Known gaps and risks

- **Cron frequency:** Vercel Hobby runs crons at most once a day. The jobs sweep wants every minute, so it
  needs Vercel Pro, or Supabase `pg_cron` with `pg_net` calling the internal route.
- **Rate-limit pruning:** `rate_limit_prune()` exists but isn't scheduled yet. The cron sweep should call
  it (Phase 6).
- **Rate limiter fails open:** a Postgres outage disables rate limits rather than blocking all traffic.
  The IP and per-user limits come back as soon as the database does.
- **Auth round trip:** each request calls Supabase Auth to check the session. That's what makes sign-out
  take effect immediately, at the cost of some latency.
- **Published-page deletes:** the database allows them so retention purges work. The API blocks authors
  from changing a page once any linked edition is published (or the deadline has passed). Photo delete
  stays allowed.
- **Storage outbox:** files queued in `storage_deletions` aren't removed until the Phase 6 worker exists.
- **Slur test cases:** the fixture uses a marker token. Real examples for live moderation tests belong in
  an untracked, gated file.

- **Stub moderation is keyword rules only.** It exists for tests and development; config refuses it in
  production, so a real moderator must be integrated before launch.
- **Real provider not integrated:** `AI_PROVIDER=real` selects a placeholder that fails every call
  (`provider_unavailable`). The plug-in instructions are in `src/lib/ai/providers/real/provider.ts`.
- **Grounding is a heuristic.** It catches invented capitalized names and numbers. Scripts without letter
  case only get the number check, and invented lowercase facts aren't caught. The system prompt is the
  main defence.
- **Per-instance limits:** the concurrency cap and circuit breakers live in process memory, so each
  serverless instance has its own.
- **Panels wait for the image**, so the generate, rewrite, avatar and panel routes set `maxDuration = 60`.
  Check that the Vercel plan allows that duration.
- **Horoscopes in the edition bundle stay empty** until Phase 5 generates them. Birthdays are already
  included (month-day only) when they fall in the edition week.
- **Browser coordinates reach our server** for weather. They're rounded and never stored or logged, but
  they do leave the browser. The web app also sends exact coordinates to BigDataCloud for reverse
  geocoding today; that should go (see the frontend change list).
- **Shared pages and different deadlines:** a page in papers whose owners live in different timezones
  locks at the earliest deadline, which can be up to a day earlier than the later paper's deadline.
- **AI daily caps fail open with the rate-limit store.** If Postgres is unreachable, caps aren't
  enforced, but nothing else works either in that case.

## Endpoint shape changes

- 0.2.0: `Member.name` is nullable, and invite creation is capped at 5 active invites (`409 conflict`).
- 0.3.0: `content_blocked` errors include `details`; the self-harm case has a fixed supportive message.
- 0.4.0: bare JSON responses and flat errors; one story per edition with `/api/story` and `/api/panel`;
  `/api/events` became `/api/highlights`; avatars per style with `/api/avatar/photo`; paper `style`; 8-member
  cap; CORS.
- 0.5.0: one page per person per week under `/api/pages/*` (stories per highlight plus the person's own
  comic), linked to several papers; style per person; 6-character invite codes and a per-IP join limit;
  reactions, saved editions, lucky numbers and 14-day retention; `GET /api/weather`.

See the changelog in `docs/api-contract.md`.
