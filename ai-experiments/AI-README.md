# AI part of The Weekly Funnies

Everything that calls Meta's models lives here. The server routes call four functions in `ai.mjs`. The test scripts show how each one is used.

## Setup

```
cd ai-experiments
npm install
```

Make a file called `.env.local` in this folder (never commit it) with one line:

```
META_API_KEY=your_key_here
```

The key is **server-side only**. Never put it in the browser or in a variable starting with `VITE_` or `NEXT_PUBLIC_`.

Run any test script like this:

```
node --env-file=.env.local test-full.mjs manga
```

Optional settings: `STORY_MODEL` (default `muse-spark-1.1`) and `IMAGE_MODEL` (default `muse-image-1.0`).

## The four functions (`ai.mjs`)

| Function | Give it | Get back | Takes |
|---|---|---|---|
| `drawAvatar({ selfiePath, style, tweaks, traits })` | a selfie file path (or none, with `traits` text), a style, optional tweaks | PNG bytes (`Buffer`) | 10-30s |
| `writeStory({ reporter, highlights })` | `{ name, city }` and `[{ id, text, serious, inComic }]` | `{ stories, strip }` (see below) | a few seconds |
| `rewriteStory({ reporter, highlight, previousHeadline })` | one highlight | `{ headline, article }` | a few seconds |
| `drawPanel({ avatarPath, style, scene, mood })` | the avatar file path, a style, a scene, optional mood | PNG bytes (`Buffer`) | 10-30s |

- `tweaks` is `{ hairColor, glasses, outfitColor }` with plain words like `"bright red"`. `HAIR_COLOR_NAMES` and `OUTFIT_COLOR_NAMES` are exported for turning the app's color choices into words.
- `drawAvatar` and `drawPanel` take **file paths**. If an upload arrives in memory, write it to a temp file first and pass that path.
- The functions return image **bytes**. The server saves them to storage and hands the app a link.

### What `writeStory` returns

```json
{
  "stories": [
    { "highlightId": "h1", "section": "Pets", "headline": "...", "article": "..." }
  ],
  "strip": {
    "title": "...",
    "panels": [
      { "highlightId": "h1", "scene": "...", "dialogue": ["..."], "caption": "...", "mood": "grin" }
    ]
  }
}
```

The strip always has exactly 4 panels. `strip` is `null` if no highlight is marked for the comic. A highlight with `serious: true` gets a plain, joke-free story.

## Styles (`styles.mjs`)

Style keys: `classic`, `manga`, `superhero`, `sketch`. The app code currently says `hero` for superhero, and `normalizeStyle()` accepts both.

Pictures never contain text. The app lays the captions and speech bubbles over them.

## Things to know

- Image generation takes 10-30 seconds per picture. Start all 4 panels at once, and show each as it finishes. Don't make the browser wait on one long request.
- A panel can occasionally fail, so give each one a retry button.
- Avatars are square. Panels are requested at 1536x1024 (3:2), and the app crops them to 4:3.

## Test scripts

| Script | What it does |
|---|---|
| `test-text.mjs` | one headline from Muse Spark (checks the key works) |
| `test-avatar.mjs` | one selfie to one avatar |
| `test-styles.mjs` | a selfie in all 4 styles (or name some: `... test-styles.mjs manga sketch`) |
| `test-story.mjs` | an early version of the story writer |
| `test-panels.mjs` | 4 panels in one style from a saved avatar |
| `test-full.mjs` | the whole loop: stories, comic script, 4 panels, preview page |
| `make-preview.mjs` | rebuilds the preview page from the last `test-full` run (free) |
The test scripts expect `selfie.jpg` in this folder. Pictures and previews are ignored by git on purpose, because they're real faces.
