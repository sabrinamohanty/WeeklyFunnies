# Copilot instructions for WeeklyFunnies

## Project shape
- This repo has two separate apps: the browser demo app at the repo root, and the real backend in `backend/`.
- Root app: Vite + React + TypeScript. The main app shell is `src/main.tsx`; route auth gating lives there, and session state is kept in `src/store.tsx` with persisted `localStorage` plus a session-only sign-in flag.
- Root server: `server/index.ts` is a small Node HTTP service that generates avatar/story/panel content via the Meta API. It validates inputs with Zod, rate-limits per IP, caches generated images in `server/generated/`, and exposes `/api/avatar`, `/api/story`, and `/api/panel`.
- Backend: `backend/` is the real production API: Next.js 16, Supabase, strict Zod contracts in `backend/src/lib/contract`, and route handlers under `backend/src/app/api`. OpenAPI is generated into `backend/docs/openapi.yaml`.
- Data flow: the web app is intentionally mock/demo-oriented; the backend is the place for real user data, auth, storage, and AI request orchestration.

## Architectural conventions
- Keep route changes contract-first in `backend/src/lib/contract`: add/edit the route entry and matching schema before implementing the handler.
- Follow the backend pattern in `backend/src/app/api/.../route.ts`: wrap each endpoint with `defineRoute(...)` and keep validation strict; unknown fields are rejected.
- Do not add `NEXT_PUBLIC_` secrets or browser-side model calls. Secrets live in `.env.local`/server config only.
- The backend uses bearer-token auth, not cookies, and CORS is explicitly allowlisted (`CORS_ALLOWED_ORIGINS`).
- Logging is metadata-only: never log prompts, user text, images, or tokens.

## Developer workflows
- Root frontend: `npm install`, `npm run dev`, and in a second terminal `npm run server` when using AI-generated avatars/stories/panels. The app reads `.env.local` for model settings.
- Root production build: `npm run build` (TypeScript + Vite build). iOS requires `npm run ios` after `npm run build` and `cap sync ios`.
- Backend: from `backend/`, use `pnpm install`, `pnpm db:start`, `pnpm dev`, and `pnpm test`/`pnpm check`.
- Backend API contract regeneration: `pnpm openapi` and `pnpm openapi:check`; CI expects generated OpenAPI and route/schema parity to be up to date.
- Integration tests need local Supabase: `pnpm test:integration` after `pnpm db:start`.

## Codebase-specific patterns
- Frontend state is intentionally centralized in `src/store.tsx` with `useStore()`; avoid scattering app-wide state into ad hoc contexts.
- Screens are organized by flow in `src/screens/`, one screen per file, and route guards are defined in `src/main.tsx`.
- Demo data lives in `src/data.ts`; app-level resets are done by clearing `meanwhile:v1` from localStorage.
- The generation server implements short retry/backoff plus an in-memory limiter for AI calls (`slot()` in `server/index.ts`), so bursty requests do not overwhelm provider limits.
- In the backend, contracts and tests are treated as source-of-truth artifacts; if you change a schema, update the generated API docs and relevant tests together.

## Quality bar
- Prefer the existing patterns over framework defaults: strict validation, explicit route contracts, low-coupling service boundaries, and minimal environment leakage.
- Examples to follow: `server/index.ts` request parsing and validation, `src/store.tsx` persistence/session lifecycle, and `backend/src/lib/contract` as the API registry.
- If a task touches both apps, update the root demo and the backend contract/docs together when behavior changes.
