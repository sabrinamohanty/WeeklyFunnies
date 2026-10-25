# Meanwhile backend

The API and web app for **Meanwhile** ("The Weekly Funnies"): a weekly newspaper and comic strip for a
group of friends. The Vite frontend lives in `frontend/`. Real AI model calls plug in through the
interfaces described below.

- **API contract for the frontend:** [docs/api-contract.md](docs/api-contract.md), plus the generated
  [docs/openapi.yaml](docs/openapi.yaml) for client types.
- **Progress, decisions, and known gaps:** [NOTES.md](NOTES.md).

## Status

| Phase | What                                                                                    | State       | Branch      |
| ----- | --------------------------------------------------------------------------------------- | ----------- | ----------- |
| 0     | Scaffold, API contract, request pipeline                                                | Done        | `phase-1`   |
| 1     | Database schema, private storage buckets, row-level security and storage policies       | Done        | `phase-1`   |
| 2     | Auth (token verification), profile and geocoding, papers, invites, joining, rate limits | Done        | `phase-2-3` |
| 3     | AI layer and safety behind the stub provider, aligned with the web app                  | Done        | `phase-2-3` |
| 4     | Core routes and data: pages, highlights, photos, avatars, panels, editions, reactions   | Done        | `phase-4-5` |
| 5     | Non-AI content: weather, birthdays, horoscopes                                          | Done        | `phase-4-5` |
| 6     | Retention: sliding expiry, logout purge, cleanup cron                                   | Done        | `phase-4-5` |
| 7     | Seed data for the frontend, end-to-end check with the web app, docs                     | Not started | `phase-6-7` |
| 8     | Real AI providers (Anthropic for text, Meta Muse Image for images), live smoke tests    | Not started | `phase-8`   |

Every endpoint exists and answers in the standard response and error shapes. Endpoints whose phase isn't
built yet return `501 not_implemented`.

### What's left, phase by phase

- **Phase 4: core routes and data.** Done on `phase-4-5`. Weekly pages linked to papers; highlights,
  stories, panels, reactions, and saved editions; uploads re-encoded with metadata stripped; generate,
  rewrite, draw, approve, publish (owner, after the deadline), save, and reactions.
- **Phase 5: non-AI content.** Done on `phase-4-5`. `GET /api/weather` reads Open-Meteo for the browser's
  location or the profile city. Coordinates are rounded to about 10 km before the request and are never
  stored or logged. Birthdays for the edition week were already in the bundle. Horoscopes are written once
  per sign per Monday, through the AI layer (the stub in development), with a fallback line. The lucky
  number is still computed on the server. A draft edition includes them, so the stars page does not wait
  for Sunday's publish.
- **Phase 6: retention.** Done on `phase-4-5`. `POST /api/session/logout` revokes every session, then
  records when drafts may be deleted (24 hours later). The old token stops working, which is what hides
  those drafts. Signing back in clears that clock. A signed-in request refreshes `last_active_at` at most
  once an hour, and drafts are deleted after 30 days of silence. Published editions past `expires_at` are
  deleted unless they were saved. A past page that no paper still links is deleted with its photos and
  panels. Selfies past `selfie_expires_at` are cleared and their files removed. `GET /api/internal/cleanup`
  does that work, drains `storage_deletions`, and calls `rate_limit_prune`. The profile, look, and approved
  avatar stay. The web app calls logout before it clears the session on this device.
- **Phase 7: seed data and frontend check.** A re-runnable seed with a few fake friends, placeholder
  avatars and one published edition; a run-through with the web app (CORS, auth, the page and panel
  flow); docs brought up to date.
- **Phase 8: real AI providers.** Anthropic for stories and horoscopes, Meta Muse Image (through the
  AI/ML API gateway) for avatars and panels, behind `AI_PROVIDER=real`; a real moderation provider; live
  smoke tests behind `AI_LIVE_TESTS=1`; spend limits at the providers. Account deletion is deferred until
  an App Store or public launch.

## Bugs found, blocks, and challenges

Each bug recorded here includes the issue, the steps that fixed it, and the tests that keep the fix from slipping. The weekly page was wired to the API first, then checked with one browser walkthrough. That pass created a paper, saved a highlight, drew four panels, and showed the draft on the front page. It looked finished. The breaks below showed up only after tests were written against the wiring.

### `pageFields` dropped unsaved highlights

`continueWrite` passes `state.highlights` into `pageFields`. When the server page already had saved highlights, `pageFields` replaced the list with the server copy. A new highlight still sitting only on this device, with no server id yet, disappeared as soon as the reader went back to the assignment desk and continued.

`loadAccount` had the same hole on refresh. Drafts live in `localStorage` until they receive a server id. If the page already had any highlight, those drafts were ignored instead of appended.

The load path now keeps every server highlight and appends local ones whose ids are not on the server. Blank cards are not treated as new drafts. The merged list is capped at three highlights.

### Edits made before sync were overwritten

A second case: the reader changes a highlight that is already saved, then leaves the screen before that edit is synced. `pageFields` wrote the server text back over the in-progress change.

When the screen hands over its current list, that list wins for every id it still shows. Matching rows keep the local text, the serious and in-comic flags, and the photos on screen, including a photo just removed. Empty local cards are filtered out, and one empty card remains when there is nothing to edit, so the form still has a place to type. A lone blank card does not wipe highlights the server already has.

### Tests came after the implementation, and tried to break it

The check followed the same order as the prompt. Implement the wiring. Say exactly what was run, what kind of check it was, and how thin it was (one happy-path walkthrough). Then suggest the tests, write them, aim them at edges that might break the feature, and fix what fails.

Each test is small and covers one case: a fourth highlight, a blank card next to a saved one, text edited before sync, a serious highlight left in the comic, a delete that fails before an add, a GIF mixed with an oversized photo, one panel that fails mid-draw, a drag that must save once on drop, an unchanged headline, a stale page, a draft shown on the wrong paper, a reaction tapped twice, a selfie with no consent, an HTML error page, the self-harm response, February 31. The point is to make the code fail on purpose so a screen that looks right from the outside still holds up. `pnpm test` runs the backend unit and AI tests, then these 65 frontend tests. The API is mocked. A running database is not required.

The same pass fixed the failures those tests produced: a failed panel draw no longer cancels the whole proof sheet, a drag no longer saves on every hover, several photo errors in one drop stay visible together, a full highlight no longer says "use a JPEG", a non-JSON response no longer crashes the client, and the self-harm response keeps its crisis line.

### Sending yourself a sign-in link returned 400 and 500

The browser console showed three failed Auth calls while using "email me a sign-in link":

- `POST /auth/v1/token?grant_type=password` returned 400.
- The same password call returned 400 again.
- `POST /auth/v1/otp?redirect_to=http://localhost:5173/auth/callback` returned 500.

The local Auth log split them apart. The password calls were `invalid_credentials`, a few seconds before the account existed. The magic-link request is what created `abrokwaesi42@gmail.com`. That account has no password, so the password form keeps failing for it. Sign in with the link.

The 500 was `duplicate key value violates unique constraint "users_email_partial_key"`, surfaced as `unexpected_failure` because the insert's transaction was already aborted. The check-email screen calls `signInWithOtp` from a mount effect. In development, React StrictMode runs that effect twice, back to back. Both requests tried to insert the same new email. One insert won and returned 200 (`user_recovery_requested`). Mailpit, which serves the local inbox at <http://127.0.0.1:54324>, stored "Your sign-in link." The other request hit the unique email index and returned 500, which is the error on screen.

That successful message still would not have opened the app. `site_url` was `http://127.0.0.1:3000`, and `additional_redirect_urls` allowed only `https://127.0.0.1:3000`. Auth replaced the Vite callback with the site URL, so the link's `redirect_to` was `http://127.0.0.1:3000`.

Steps that fixed it:

1. Overlapping sign-in-link requests for the same email now share one in-flight promise (`shareInflight` in `frontend/src/lib/inflight.ts`). `CheckEmail` waits on that promise, so the second mount joins the first request instead of inserting the user again.
2. `supabase/config.toml` now sets `site_url` to `http://localhost:5173` and allows `http://localhost:5173/auth/callback` and `http://127.0.0.1:5173/auth/callback`. Local `email_sent` went from 2 per hour to 30, so trying the link more than twice is not cut off.
3. Local Supabase was restarted with `supabase stop` and `supabase start`. The database came back from its backup. Auth's environment after the restart has `GOTRUE_SITE_URL=http://localhost:5173` and the two callback URLs in `GOTRUE_URI_ALLOW_LIST`. A fresh magic link stores `redirect_to=http://localhost:5173/auth/callback`. The link has to be requested from the app in the same browser, because the app uses PKCE and stores the code verifier there.

Tests: `frontend/src/lib/inflight.test.ts` checks that two overlapping calls for one key run the work once, and that a later call runs again after the first settles. `frontend/src/screens/auth.test.tsx` renders the check-email screen inside `StrictMode` and expects a single `signInWithOtp` call plus the "on its way" toast. The redirect allow list is local Auth config, so it is checked with the Auth environment and the link in Mailpit after a restart, not with the mocked frontend suite. `pnpm test` now includes these three frontend tests along with the earlier 65.

### A real horoscope was hidden behind the sample reading

The edition bundle stores signs in lowercase (`libra`). The stars page compared that to the title-case sign from the birthday (`Libra`), so a horoscope the server had written never replaced the sample line, and the lucky number stayed the day of the month.

The page now matches signs without regard to case, and shows the edition's text and lucky number when that row exists. `frontend/src/screens/read.test.tsx` covers a `libra` row on a Libra birthday. `frontend/src/weather.test.ts` checks that a forecast dated Saturday night in Chicago still shows Saturday the 24th as today, instead of shifting the calendar date. `tests/unit/weather.test.ts` checks rounding, a skipped bad day, and that the Open-Meteo request receives `30.3,-97.7` rather than the precise point. The edition integration test checks that reading a draft writes one shared Libra horoscope and that a published earlier week gets its own. The frontend suite is 70 tests.

### Retention setup tripped two database checks

The cleanup tests set a profile's timezone to UTC on its own, and they inserted a page link onto an edition that was already published. Both writes were rejected.

`profiles_city_complete` requires the city name, latitude, longitude, and timezone to be all set or all empty. A timezone with no city is not a valid profile. The tests leave the timezone empty. With no timezone stored, the current page uses UTC, and the test pages are created for that same Monday.

`page_papers_draft_only` raises `edition_locked` when a page is linked to an edition that is already published. The page has to be linked while the edition is still a draft. The test then publishes it, either as a saved edition (`saved_at` set, `expires_at` empty) or as an expired one (`expires_at` in the past).

`tests/integration/api-retention.test.ts` covers both outcomes. An idle author's saved edition and its page stay, and that author's other draft is deleted. An expired edition is deleted, and so is the past page that was its only copy. The same file checks logout, signing back in, the 24-hour grace, the 30-day window, selfie expiry, the storage outbox, and rate-limit pruning.

## Contract notes for the frontend

- **Contract 0.5.0:** each person writes one page per week under `/api/pages/*`, posted to the papers
  they pick. Style is on the profile. Invite codes are 6 characters. New reactions, saved editions and
  `GET /api/weather`. See the changelog in `docs/api-contract.md`.

- **Contract 0.3.0:** blocked-content errors now include `details`, with issue `content_blocked` or
  `self_harm_support`. The self-harm case sends a fixed supportive message the app should show with
  support resources.

## Stack

- **API:** TypeScript and Next.js 16 route handlers, deployable on Vercel.
- **Frontend:** the Vite app in `frontend/`. CORS is an exact-origin allowlist
  (`CORS_ALLOWED_ORIGINS`), and requests use a bearer token, never cookies.
- **Database, auth, and storage:** Supabase (Postgres, Auth, and Storage). The web app signs in with
  Supabase Auth directly and sends its access token to this API.
- **Validation:** Zod 4 schemas in `src/lib/contract`, which also generate the OpenAPI file.
- **Tests:** Vitest, split into unit, AI, and integration projects. Integration tests run against local
  Supabase. The frontend suite in `frontend/src` mocks the API and runs as part of `pnpm test`.
- **AI:** a vendor-neutral `AiService` over a swappable `AiProvider` (`AI_PROVIDER=stub|real`) and
  `Moderator` (`MODERATION_PROVIDER=stub|real`). The stub returns deterministic fake data, so everything
  runs with no AI keys. Four art styles (`classic`, `manga`, `sketch`, `superhero`) are plain config in
  `src/lib/ai/styles.ts`.

## Getting started

Requirements: Node 22.12 or newer (24 recommended, see `.nvmrc`), and Docker for local Supabase.

```sh
corepack enable                 # provides pnpm; or prefix commands with `npx pnpm@10.34.8`
pnpm install
cp .env.example .env.local      # fill in values; never commit .env files
pnpm db:start                   # local Supabase; prints the URL and keys for .env.local
pnpm dev                        # http://localhost:3000
curl localhost:3000/api/health  # {"status":"ok"}
cd frontend && npm install && npm run dev   # http://localhost:5173
```

The web app reads `frontend/.env.local` (`VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Set `CORS_ALLOWED_ORIGINS=http://localhost:5173` in the API `.env.local`.

## Checking the database locally

After `pnpm db:start`:

- **Supabase Studio** at <http://127.0.0.1:54323> shows tables, policies, and storage buckets.
- **`pnpm test:integration`** creates throwaway users and data, proves what each user can and can't read
  or write, and cleans up after itself.
- **`pnpm db:reset`** rebuilds the local database from the migrations.

## Commands

| Command                            | What it does                                                     |
| ---------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                         | Run the API locally                                              |
| `pnpm build`                       | Production build (also type-checks)                              |
| `pnpm test`                        | Backend unit and AI tests, then the frontend suite; no services  |
| `pnpm test:integration`            | Integration tests; needs `pnpm db:start`                         |
| `pnpm check`                       | Typecheck, lint, format check, OpenAPI drift check, and tests    |
| `pnpm openapi`                     | Regenerate `docs/openapi.yaml` after changing `src/lib/contract` |
| `pnpm db:start` / `stop` / `reset` | Manage local Supabase                                            |

## Project layout

```
src/app/api/        Route files. Each wraps one contract entry with defineRoute().
src/proxy.ts        CORS allowlist, and JSON 404 and 405 for unknown paths and methods.
src/lib/contract/   Zod schemas and the route registry: the single source of truth.
src/lib/http/       Request pipeline: auth, rate limits, validation, body limits, error shape.
src/lib/auth/       Token verification and the cron secret check.
src/lib/ai/         AiService, its interfaces, style presets, and the stub and real (placeholder) providers.
src/lib/safety/     Redaction, delimiters, prompt templates, look builder, output validation, fallbacks.
src/lib/config/     Environment schema, validated at boot.
src/lib/log/        Metadata-only structured logger.
src/lib/ratelimit/  Rate limiter interface and the Postgres implementation.
supabase/           Local Supabase config and migrations (schema, row-level security, storage).
tests/              unit/, ai/, integration/, and fixtures/ (shared text and upload cases).
docs/               API contract and generated OpenAPI.
frontend/           Vite web app. Talks to this API with a Supabase bearer token.
```

## Adding or changing an endpoint

1. Add or edit its entry in `src/lib/contract/routes.ts`, with schemas in the matching contract file.
2. Implement it in `src/app/api/.../route.ts` with `defineRoute(routes.yourRoute, handler)`.
3. Run `pnpm openapi`, and update `docs/api-contract.md`, including its changelog if the shape changed.
4. `pnpm check`. Tests fail if a contract entry has no route file, a route file isn't in the contract, a
   schema isn't strict, or the OpenAPI file is stale.

## Security essentials

- **Secrets:** server-side only, in environment variables. The frontend only ever gets the Supabase URL
  and anon key. `.env*` files are git-ignored except `.env.example`. Never use `NEXT_PUBLIC_` for keys.
- **No model calls from the browser:** every generation goes through this API.
- **Strict validation:** every input is checked against a strict schema, and unknown fields are rejected.
  Ids from the client are always checked against the database.
- **Safe errors:** clients get generic messages. Logs carry ids and timings, never user text, prompts,
  images, or tokens.
- **Service-key routes:** any route using the service key checks auth, paper membership, and ownership
  itself.
- **Vendor isolation:** vendor AI SDKs may only be imported in `src/lib/ai/providers/real/`, and a lint
  rule enforces this.
