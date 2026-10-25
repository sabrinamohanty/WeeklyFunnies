# Contributor seed preparation

## Prepared comic artwork

Store each contributor's prepared comic in `comics/<contributor-id>/`. Lauren's complete comic is the single image `comics/lauren/good_week.jpg`; `comic.json` identifies that image and links it to the generated highlight ids. Display the whole image as supplied. Image paths in that file are relative to its own folder. Highlight ids currently follow array position, so update these links if highlights are reordered or removed.

These are supplied demo assets, not artwork produced by the seed generator. The generator does not copy or import the comics folder. The teammate handling integration should load `comic.json` and its images separately. Send the entire `contributor-seed` folder as a ZIP so these images and the ignored personal data are included. Comic image files are excluded from Git by default.

## Selected demo behavior

Preset contributors are demo characters, not real accounts. Add their weekly events to each contributor's `highlights` array. The generator preserves attribution with `contributorId` and assigns highlight ids. `inComic` selects events for the comic; `serious` identifies serious events.

`generated/demo-seed.json` packages the roster, preset highlights, and intended test-user settings together. The intended demo starts with preset people and lets a new test user enter a profile, upload photos, and add highlights. A combined comic should draw from eligible preset and test-user highlights. These settings describe the integration contract; the existing app does not consume them yet. No real authentication provider is required for this demo.

This separate folder prepares replacement contributor data. It does not change the running app, delete existing demo people, create accounts, or implement authentication.

## Fill in your people

Use `birthday` in `MM-DD` format, such as `07-22` for July 22, or leave it blank. No birth year is required.

1. Copy `contributors.example.json` to `contributors.json` in this folder.
2. Replace the example person and add one object per contributor. Use unique ids and email addresses, and select at least one Editor.
3. Put each person's photo in `photos/` and set `photo` to its relative filename, such as `photos/sabrina.jpg`. Set `photo` to an empty string if you have no photo yet.
4. From the repository root, run:

```sh
node contributor-seed/generate.mjs
```

Requires Node.js 18 or newer and no additional packages. The generator validates the full input before writing its outputs.

The `generated/` folder contains `profiles.json`, copied photos, and `account-invitations.private.json`. Emails are included only in the private invitation file. This is a provider-neutral invitation manifest, not an executable account importer. Do not serve that private file from the frontend.

## GitHub

Commit this template folder to your repository when ready. Actual contributor information, photos, and generated outputs are ignored by default. A folder in a public repository is still public: use a private repository for personal information. To version actual seed data, first decide its privacy requirements and adjust this folder's ignore rules deliberately. Never commit passwords, session tokens, service keys, or authentication secrets. A login email identifies an intended account; it does not authenticate that person.

## Integration still required

The current app defines sample people in `src/data.ts`, hardcodes the onboarding crew in `src/screens/Onboarding.tsx`, and renders cartoon avatars. Stories, comics, horoscopes, welcome text, and old issue headlines also refer to sample people. Replacing the roster safely requires updating those references together and adding photo rendering. The browser's saved state must also be migrated or reset deliberately.

The current login is a frontend demo. For real accounts, select an authentication provider and import/invite the emails on a trusted server using that provider. Do not put credentials into frontend seeds. Contributor roles in JSON are metadata until a backend enforces permissions.

Once your roster is ready, the generated profile file and photos can be used to implement a complete replacement. This preparation leaves every existing app source file unchanged. Generated profiles are a replacement roster, not an append list; stale files from earlier runs should never be imported unless referenced by the latest profiles file.
