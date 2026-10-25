# Collaborator handoff prompt

Please integrate this prepared demo content into WeeklyFunnies. Replace the old seeded people with exactly Lauren, Esi, and Brianna, while allowing a new test user to create a profile, upload an avatar/photos, and contribute highlights. Do not merely append the new people to the old roster. Work in a branch, preserve unrelated changes, and inspect the current implementation before editing.

## Unpack and source files

Unzip `contributor-seed-handoff.zip` into the repository root, alongside `package.json`. The result must be `contributor-seed/contributors.json`, not `contributor-seed/contributor-seed/contributors.json`.

Treat `contributor-seed/contributors.json` as the canonical roster and highlight source. Keep its ids (`lauren`, `esi`, `brianna`) stable. `contributors.example.json` is a template only. This ZIP intentionally excludes `generated/` because those outputs were created before the latest roster updates.

The paper is `crew`, named **The Snoozers**, publishing Saturday. Lauren is Editor; Esi and Brianna are Contributors. Everyone lives in Austin, TX. Birthdays are month/day only: Lauren `07-22`, Esi `12-19`, Brianna `04-05`. Do not invent birth years. Adapt the existing zodiac helper to handle these month/day values; do not pass them to its existing YYYY-MM-DD parser unchanged.

## Exact asset destinations

Copy the files below to these app paths, retaining capitalization and extensions. The original source folder remains useful for handoff; the public copies are the assets the frontend should serve.

| Source inside contributor-seed/ | Destination in repository |
| --- | --- |
| photos/lauren-avatar.jpg | public/demo/photos/lauren-avatar.jpg |
| photos/esi_avatar.jpg | public/demo/photos/esi_avatar.jpg |
| photos/brianna_avatar.jpg | public/demo/photos/brianna_avatar.jpg |
| photos/concert.jpg | public/demo/photos/concert.jpg |
| photos/concert1.jpg | public/demo/photos/concert1.jpg |
| photos/drinks.jpg | public/demo/photos/drinks.jpg |
| photos/friends.jpg | public/demo/photos/friends.jpg |
| photos/esi_bowling.jpg | public/demo/photos/esi_bowling.jpg |
| comics/lauren/good_week.jpg | public/demo/comics/lauren/good_week.jpg |
| comics/esi/esi_comic.jpg | public/demo/comics/esi/esi_comic.jpg |
| comics/brianna/brianna_2x2_comic_grid.png | public/demo/comics/brianna/brianna_2x2_comic_grid.png |

Each comic is one complete image: display it intact with `width: 100%; height: auto`, without cropping or splitting it into generated panels. The `comics/<id>/comic.json` files identify each comic's owner. Their image paths resolve relative to their own folders. Empty `highlightIds` means unlinked, not that the comic is missing. Do not derive extra highlights from comic dialogue without approval.

Create a frontend adapter at `src/demoSeed.ts` to expose the normalized roster, highlights, and explicit comic URLs. Use URLs like `/demo/photos/esi_avatar.jpg` and `/demo/comics/esi/esi_comic.jpg` (respect the application's base URL if deployed in a subdirectory). Strip login emails from frontend profile data; do not copy the raw contributor JSON to `public/`. Keep real account authentication out of scope: these are preset demo people, and the test user's session is also a demo.

## Missing information to resolve

All three `bio` fields are currently empty in the supplied JSON, although the owner says bios have been prepared. Ask for that text or locate a separately supplied source; do not fabricate bios. Brianna has one supplied written highlight covering Biscuit’s adoption on Tuesday, her first 5K at Lady Bird Lake, and tacos afterward; preserve her wording and link it to her supplied comic. Esi's only supplied highlight is “i went bowling this week.” Her comic also shows a hackathon, but no corresponding highlight was supplied. Lauren has two supplied highlights with four event photos. No event photo for Brianna has been supplied. Esi and Brianna's email fields are blank; these are not required for a demo roster. Preserve available comics and avatars while handling absent optional data gracefully.

## Integration points to update together

1. `src/data.ts`: replace the old `friends` roster and its `Friend` model as needed, including an optional avatar URL and bio. Replace or rebuild old stories, strips, and horoscopes so all author references resolve to the new roster. Update old issue headlines, invites, findable papers, and seeded papers where they expose obsolete people or papers. Never map new names onto old personal stories. Seed counts and membership should match three preset contributors plus the joined test user.
2. `src/screens/Onboarding.tsx`: `Joined` currently hardcodes Lauren/Diego/Maya/Priya. Render the normalized roster instead, respecting each supplied role; append the test user once. Render each supplied avatar with an image fallback. Do not change the reusable `Cartoon` component globally merely to render these images.
3. `src/screens/Auth.tsx`: update old welcome invitation/paper text. The mini newspaper preview now cycles through four style SVGs in `src/assets/preview/`; preserve that animation. It currently selects `stories[i]` directly: use a safe modulo and an empty-list fallback when replacing the story list, since the new highlights may yield fewer than four stories.
4. `src/screens/Read.tsx`: Front should show only supported supplied highlights/stories plus the test user's published work, with correct attribution and actual event images. Comics should display the three prepared complete comic images and separately support the test user's generated comic. Update lightbox items for complete images; remove assumptions that every preset strip has four separate panels. Stars must resolve the new birthdays/people without undefined lookups.
5. `src/store.tsx`: initialize the right paper id (`crew`), selected papers, and clean test-user state. Remove the hardcoded puppy highlight from the test user's initial state. Add an explicit seed version migration or reset action for the known app storage keys (`meanwhile:v1`, `meanwhile:session`), so old papers and people do not reappear. Do not indiscriminately clear localStorage. Explain whether existing test-user drafts are preserved or reset; preserve them where possible. Keep preset data and test-user drafts separate, preventing duplicates after reload/sign-out/sign-in.
6. `src/screens/MyWeek.tsx`: keep the test user's profile, photo upload, highlights, review, and publish flow working. The current generation is a local placeholder, not real image generation. Preserve the supplied preset comics as immutable examples; include the test user's generated output alongside them with clear authorship. If one combined group strip is required, preserve contributor attribution and explain the placeholder limitation rather than claiming new AI artwork was generated. Current uploaded object URLs are dropped on reload; use durable demo storage (for example IndexedDB) if uploads must survive refresh.
7. Check `src/screens/Papers.tsx`, Settings, shared UI, and route guards for dependent paper ids, counts, and assumptions. Keep existing navigation and unrelated welcome styling working. Do not replace the current signed-in test user with one of the preset profiles implicitly.

## Validation before delivery

Run `npm run build`. Start with `npm run dev`, and use the URL printed in the terminal. Check both a clean browser session and one with old demo storage. Exercise welcome, signup/demo login, profile/avatar setup, joined masthead, Front, Comics/lightboxes, Stars, My Week/write/review/publish, Papers, Settings, refresh, and sign-out/sign-in. Confirm no undefined-author errors, broken asset requests, old demo contributors, duplicate users, stretched comics, or lost published work after navigation. Check a narrow mobile viewport and reduced-motion preference. Verify the four-style welcome preview still cycles safely with the new story count.

The optional `generate.mjs` script only prepares data; it does not integrate the app or create comics. It currently requires valid, unique email addresses for everyone, so it will fail on Esi and Brianna's blank emails. For this demo, either adapt that validation to optional emails and omit invitation generation, or use the canonical JSON through the adapter above. Do not invent real emails just to pass validation. The script does not package the comics folder automatically.

Deliver a concise list of changed files, validation results, missing content, and any remaining limitations. Do not push, deploy, or seed a production database as part of this handoff without the owner's instruction.
