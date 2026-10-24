# Meanwhile backend

The API behind **Meanwhile**, an iOS app that turns a group of friends' weekly highlights into a shared newspaper with a comic strip. This repo is the backend only. The iOS app, the real AI model calls, and the visual design live elsewhere and plug in through the interfaces described below.

- **API contract for the app:** `[docs/api-contract.md](docs/api-contract.md)`, plus the generated
  `[docs/openapi.yaml](docs/openapi.yaml)` for model generation.
- **Progress, decisions, and known gaps:** `[NOTES.md](NOTES.md)`.

## Status

Phases 0 and 1 are done:

- the scaffold and API contract;
- the database schema, four private storage buckets, and row-level security and storage policies, with
  two-user integration tests.

Every endpoint exists and answers in the standard response and error shapes. Endpoints not yet built
return `501 not_implemented`. Until Phase 2 adds token verification, user endpoints return `401`. See
`NOTES.md` for the phase plan and database details.

## Stack

- **API:** TypeScript and Next.js 16 route handlers, deployable on Vercel. There are no web pages.
- **Database, auth, and storage:** Supabase (Postgres, Auth, and Storage). The iOS app signs in with
  Supabase Auth directly and sends its access token to this API.
- **Validation:** Zod 4 schemas in `src/lib/contract`, which also generate the OpenAPI file.
- **Tests:** Vitest, split into unit, AI, and integration projects. Integration tests run against local
  Supabase.
- **AI:** a vendor-neutral `AiService` over a swappable `AiProvider` (`AI_PROVIDER=stub|real`) and
  `Moderator` (`MODERATION_PROVIDER=stub|real`). The stub returns deterministic fake data, so everything
  runs with no AI keys.

## Getting started

Requirements: Node 22.12 or newer (24 recommended, see `.nvmrc`), and Docker for local Supabase.

```sh
corepack enable                 # provides pnpm; or prefix commands with `npx pnpm@10.34.8`
pnpm install
cp .env.example .env.local      # fill in values; never commit .env files
pnpm db:start                   # local Supabase; prints the URL and keys for .env.local
pnpm dev                        # http://localhost:3000
curl localhost:3000/api/health  # {"data":{"status":"ok"}}
```

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
src/proxy.ts        JSON 404 and 405 for unknown paths and methods.
src/lib/contract/   Zod schemas and the route registry: the single source of truth.
src/lib/http/       Request pipeline: auth, rate limits, validation, body limits, error envelope.
src/lib/auth/       Token verification (Phase 2) and the cron secret check.
src/lib/ai/         AiService, AiProvider, and Moderator interfaces; providers arrive in Phase 3.
src/lib/config/     Environment schema, validated at boot.
src/lib/log/        Metadata-only structured logger.
src/lib/ratelimit/  Rate limiter interface.
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

- **Secrets:** server-side only, in environment variables. The app only ever gets the Supabase URL and
  anon key. `.env*` files are git-ignored except `.env.example`.
- **Strict validation:** every input is checked against a strict schema, and unknown fields are rejected.
- **Generic errors:** clients get generic messages. Logs carry ids and timings, never user text, images,
  or tokens.
- **Service-key routes:** any route using the service key checks auth, paper membership, and ownership
  itself.
- **Vendor isolation:** vendor AI SDKs may only be imported in `src/lib/ai/providers/real/`, and a lint
  rule enforces this.
