# Meanwhile

A weekly newspaper and comic strip about your friend group. Each friend group gets its own paper, and every in-paper screen is headed with that paper's name. This is the frontend only, running on mock data in `src/data.ts`.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check and production build
```

## Live weather

The front page shows a 7-day forecast for the reader's current location (browser location, reverse-geocoded with BigDataCloud's free client API), falling back to the city in their profile, then Austin. Forecasts come from Google's weather card via [SearchApi](https://www.searchapi.io) or [SerpApi](https://serpapi.com).

1. Copy `.env.example` to `.env.local`.
2. Fill in `SEARCHAPI_KEY` (or `SERPAPI_KEY`).
3. Restart `npm run dev`.

The key stays on the server: the page calls `/api/weather?city=…`, a route defined in `vite.config.ts`, which adds the key and caches each city for 30 minutes. Without a key the strip shows a labeled sample forecast. A production deploy needs the same route on a real server.

## Screens

| Route | Screen |
| --- | --- |
| `/welcome` | Landing page with animated front-page preview |
| `/signup`, `/login`, `/check-email` | Account creation, log in, magic-link wait (demo shortcut continues) |
| `/onboarding/profile` → `/avatar` → `/joined` | Reporter profile, cartoon avatar, masthead + invite link |
| `/front`, `/comics`, `/stars` | This week's edition (bottom tab bar) |
| `/my-week` → `/write` → `/review` | Pick papers, write highlights, proof and publish |
| `/papers`, `/papers/join` | Newsstand, join by code (try `BOOKCL`) or start a paper |
| `/back-issues` | Past editions, save to keep forever |

## Where things live

- `src/store.tsx`: app state, persisted to `localStorage`. Clear the `meanwhile:v1` key to reset the demo.
- `src/components/`: shared UI (headers, tab bar, halftone blocks, lightbox, SVG cartoon characters).
- `src/screens/`: one file per flow.
- `src/styles.css`: design tokens (light and night edition), halftone pattern, all component styles.

The story writer in `MyWeek.tsx` (`writeStory`) is a keyword-based stand-in for the real AI generation call.
