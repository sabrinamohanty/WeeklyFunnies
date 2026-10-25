# Meanwhile frontend

The web app for The Weekly Funnies. Lives in `frontend/` next to the API.

It talks to the backend at `VITE_API_URL` (local default `http://localhost:3000`) with a Supabase bearer token. Phase 2 is live: sign-in, profile, city search, papers, and invites. Stories, comics, weather, avatars, and editions stay local until those routes are built.

```sh
# from the repo root
cp frontend/.env.example frontend/.env.local   # fill in the local Supabase URL and anon key
cd frontend
npm install
npm run dev      # http://localhost:5173
```

The API must be running (`pnpm dev` in the repo root) with `CORS_ALLOWED_ORIGINS=http://localhost:5173`. Local mail for magic links is in Inbucket at http://127.0.0.1:54324.

## Screens

| Route | Backed by |
| --- | --- |
| `/signup`, `/login`, `/check-email`, `/auth/callback` | Supabase Auth |
| `/onboarding/profile` | `PATCH /api/me`, `GET /api/geocode` |
| `/onboarding/avatar` | Local cartoon; style saved with `PATCH /api/me` (avatar images are Phase 4) |
| `/papers`, `/papers/join` | `GET`/`POST /api/papers`, `POST /api/invites/join`, invite codes |
| `/front`, `/comics`, `/stars`, `/my-week`, `/back-issues` | Local preview until Phase 4–5 |
