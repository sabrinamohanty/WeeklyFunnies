# Meanwhile backend: working notes

## Status

| Phase                              | State       |
| ---------------------------------- | ----------- |
| 0. Scaffold and contract           | Done        |
| 1. Database, storage, RLS          | Next        |
| 2. Auth, papers, membership        | Not started |
| 3. AI placeholder layer and safety | Not started |
| 4. Core routes                     | Not started |
| 5. Weather, birthdays, horoscopes  | Not started |
| 6. Retention                       | Not started |
| 7. Seed data and docs              | Not started |

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
- `src/lib/http/`: the request pipeline (`defineRoute`), body limits, and the error envelope.
- `src/proxy.ts`: JSON 404 and 405 for unknown paths and methods.
- `src/lib/config/env.ts`: environment schema. It fails fast on boot and errors name keys, never values.
- `src/lib/ai/types.ts`: `AiService`, `AiProvider`, and `Moderator` interfaces (implementations in Phase 3).
- `src/lib/log/`: metadata-only JSON logger with key-based redaction.
- `tests/fixtures/text-cases.ts`: shared text cases for every text route and the AI safety layer.

## Decisions (agreed)

- **Stack:** Next.js 16 route handlers on Vercel; Supabase for Auth, Postgres, and Storage; Zod 4; Vitest;
  pnpm. TypeScript is pinned to 6.0 because typescript-eslint doesn't support 7.x yet.
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
  - **posts in a published edition are deleted 30 days after that edition was published**, regardless of
    logout;
  - the avatar is part of the profile and is kept;
  - the selfie is kept until avatar approval, 1 hour at most.
- **Papers:** a user can be in several papers. Only the owner publishes, and only approved strips are
  published. Weeks start Monday in the owner's timezone.
- **Invites:** multi-use codes with a 7-day expiry, revocable, stored hashed, with a 12-member cap.
- **Profile:** full birthday stored, but only month and day are ever shown to others. The user picks a
  city from geocode candidates.
- **Weather:** the reader's own city, a 7-day forecast cached per city per day.
- **Limits:** 1 to 3 highlights per person per edition, 4 photos per highlight, 500 characters per
  highlight.
- **Moderation:** self-harm and crisis content is blocked with a supportive message. Other sensitive
  topics force `serious` on.
- **AI layer:** an `AiService` (safety lives here) over a thin `AiProvider`, with a structured `PanelSpec`.
  A lint rule blocks vendor SDK imports outside `src/lib/ai/providers/real/`.
- **Draft visibility:** in a draft, members see only their own posts, plus each member's progress status.
  Others' events appear after publishing. The bundle and row-level security both enforce this.
- **Age:** no minimum age is enforced for now.
- **Photo captions:** none. Photos are images only. The "injection in a caption" test applies to name
  fields instead.
- **Account deletion:** deferred. There are no App Store submission plans for now, so it isn't blocking.

## Open questions

None right now.

## Known gaps and risks

- **Cron frequency:** Vercel Hobby runs crons at most once a day. The jobs sweep wants every minute, so it
  needs Vercel Pro, or Supabase `pg_cron` with `pg_net` calling the internal route.
- **Rate limiter:** it's in memory until Phase 2, so it isn't shared across serverless instances.
- **Placeholder auth:** user routes return 401 until Phase 2 adds token verification (fail closed).
- **Slur test cases:** the fixture uses a marker token. Real examples for live moderation tests belong in
  an untracked, gated file.

## Endpoint shape changes

None since contract 0.1.0. See the changelog in `docs/api-contract.md`.
