# Meanwhile backend

The API behind **Meanwhile** ("The Weekly Funnies"), a web app that turns a group of friends' weekly
highlights into a shared newspaper: one article and one 4-panel comic strip per edition, plus weather,
horoscopes and birthdays. This repo is the backend only. The web frontend, the real AI model calls, and
the visual design live elsewhere and plug in through the interfaces described below.

- **API contract for the frontend:** [docs/api-contract.md](docs/api-contract.md), plus the generated
  [docs/openapi.yaml](docs/openapi.yaml) for client types.
- **Progress, decisions, and known gaps:** [NOTES.md](NOTES.md).

## Status

| Phase | What                                                                                    | State       | Branch      |
| ----- | --------------------------------------------------------------------------------------- | ----------- | ----------- |
| 0     | Scaffold, API contract, request pipeline                                                | Done        | `phase-1`   |
| 1     | Database schema, private storage buckets, row-level security and storage policies       | Done        | `phase-1`   |
| 2     | Auth (token verification), profile and geocoding, papers, invites, joining, rate limits | Done        | `phase-2-3` |
| 3     | AI layer and safety behind the stub provider, aligned with the comic pipeline handoff   | Done        | `phase-2-3` |
| 4     | Core routes and data: highlights, photos, avatars, story, panels, bundle, publish       | Next        | `phase-4-5` |
| 5     | Non-AI content: weather, birthdays, horoscopes                                          | Not started | `phase-4-5` |
| 6     | Retention: sliding expiry, logout purge, cleanup cron                                   | Not started | `phase-6-7` |
| 7     | Seed data for the frontend, end-to-end check with the web app, docs                     | Not started | `phase-6-7` |
| 8     | Real AI providers (Anthropic for text, Meta Muse Image for images), live smoke tests    | Not started | `phase-8`   |

Every endpoint exists and answers in the standard response and error shapes. Endpoints whose phase isn't
built yet return `501 not_implemented`.

### What's left, phase by phase

- **Phase 4: core routes and data.**
  - Database: highlights (from `events`), per-edition stories and panels with image status, avatars per
    style, and avatar photos, with row-level security and two-user tests.
  - Uploads: content sniffing, size and dimension limits, re-encoding, EXIF and GPS stripping, photo
    moderation.
  - Routes: highlights and photos, `POST /api/avatar/photo`, `GET`/`POST /api/avatar`, `/api/story`,
    `/api/panel` (with the image cache and per-edition caps), current edition and editions list, the
    edition bundle with signed URLs, reordering, and publishing.
- **Phase 5: non-AI content.** Weather from Open-Meteo for the reader's city, cached per city per day;
  the birthdays query for the edition week; weekly horoscopes per sign through the AI layer, with a
  fallback line.
- **Phase 6: retention.** The 30-day sliding window, `POST /api/session/logout` (sign out everywhere,
  hide drafts, purge after 24 hours), the cleanup cron that deletes rows and files together, avatar photo
  expiry, and rate-limit pruning. Tests for all of it.
- **Phase 7: seed data and frontend check.** A re-runnable seed with a few fake friends, placeholder
  avatars and one published edition; a run-through with the web app (CORS, auth, the story and panel
  flow); docs brought up to date.
- **Phase 8: real AI providers.** Anthropic for the story and horoscopes, Meta Muse Image (through the
  AI/ML API gateway) for avatars and panels, behind `AI_PROVIDER=real`; a real moderation provider; live
  smoke tests behind `AI_LIVE_TESTS=1`; spend limits at the providers. Account deletion is deferred until
  an App Store or public launch.

## Contract notes for the frontend

- **Contract 0.3.0:** blocked-content errors now include `details`, with issue `content_blocked` or
  `self_harm_support`. The self-harm case sends a fixed supportive message the app should show with
  support resources.

## Stack

- **API:** TypeScript and Next.js 16 route handlers, deployable on Vercel. There are no pages in this repo.
- **Frontend access:** the web app runs on its own origin. CORS is an exact-origin allowlist
  (`CORS_ALLOWED_ORIGINS`), and requests use a bearer token, never cookies.
- **Database, auth, and storage:** Supabase (Postgres, Auth, and Storage). The web app signs in with
  Supabase Auth directly and sends its access token to this API.
- **Validation:** Zod 4 schemas in `src/lib/contract`, which also generate the OpenAPI file.
- **Tests:** Vitest, split into unit, AI, and integration projects. Integration tests run against local
  Supabase.
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
```

To call the API from the web app in local development, run the frontend on its Vite dev port (5173) and set `CORS_ALLOWED_ORIGINS=http://localhost:5173` in `.env.local`.

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
| `pnpm test`                        | Unit and AI tests; no external services needed                   |
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
