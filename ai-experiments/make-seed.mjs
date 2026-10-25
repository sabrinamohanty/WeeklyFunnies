import fs from "fs";
import { drawAvatar, writeStory, drawPanel } from "./ai.mjs";

// Makes the fake friends for the demo paper (and a backup edition if the AI is slow on demo day).
// For each friend it saves: a portrait, a story file, and 4 comic panels, into seed-data/<name>/
//   node --env-file=.env.local make-seed.mjs
// It's safe to run again: anything already made is skipped, so a failed panel is the only thing redone.
// Files are named portrait.png / scene-N.png / strip.json on purpose, so git will keep them.

const FRIENDS = [
  {
    id: "lauren", name: "Lauren", city: "Austin", style: "classic", sign: "Aries",
    traits: "a young woman with light skin and shoulder-length auburn-brown hair, wearing a soft pink top",
    highlights: [
      { id: "h1", text: "Hosted a movie night for the whole crew on Friday.", serious: false, inComic: true },
      { id: "h2", text: "Tried baking bread for the first time and it actually rose.", serious: false, inComic: true },
    ],
  },
  {
    id: "diego", name: "Diego", city: "Austin", style: "superhero", sign: "Libra",
    traits: "a young man with tan skin and short black hair, wearing an orange t-shirt",
    highlights: [
      { id: "h1", text: "Adopted a puppy named Biscuit from the shelter on Tuesday!", serious: false, inComic: true },
      { id: "h2", text: "Took Biscuit for a walk at Zilker Park on Saturday morning.", serious: false, inComic: true },
    ],
  },
  {
    id: "maya", name: "Maya", city: "Austin", style: "manga", sign: "Scorpio",
    traits: "a young woman with fair skin and bright red hair, wearing a blue top and a baseball cap",
    highlights: [
      { id: "h1", text: "Finished my first 5K at Lady Bird Lake and went straight to breakfast tacos.", serious: false, inComic: true },
      { id: "h2", text: "Signed up for my next race.", serious: false, inComic: true },
    ],
  },
  {
    id: "priya", name: "Priya", city: "Austin", style: "sketch", sign: "Gemini",
    traits: "a young woman with deep brown skin and long black hair, wearing a green sweater",
    highlights: [
      { id: "h1", text: "Survived three midterms in four days, mostly on cold brew.", serious: false, inComic: true },
      { id: "h2", text: "Spent most of the week at one desk in the library.", serious: false, inComic: true },
    ],
  },
  {
    id: "sam", name: "Sam", city: "Austin", style: "classic", sign: "Capricorn",
    traits: "a young man with light tan skin, short brown hair and round glasses, wearing a purple sweater",
    highlights: [
      { id: "h1", text: "Started a new job as a junior designer at a downtown design studio on Monday.", serious: false, inComic: true },
      { id: "h2", text: "Got a desk by the window on my first day.", serious: false, inComic: true },
    ],
  },
];

fs.mkdirSync("seed-data", { recursive: true });
const started = Date.now();
const secs = () => ((Date.now() - started) / 1000).toFixed(0) + "s";
const manifest = [];

for (const f of FRIENDS) {
  const dir = "seed-data/" + f.id;
  fs.mkdirSync(dir, { recursive: true });
  console.log("\n" + f.name + " (" + f.style + " style) at " + secs());

  try {
    // 1. Portrait, drawn from words (no selfie)
    const portrait = dir + "/portrait.png";
    if (!fs.existsSync(portrait)) {
      fs.writeFileSync(portrait, await drawAvatar({ style: f.style, traits: f.traits }));
      console.log("  portrait done at " + secs());
    } else {
      console.log("  portrait already made, skipping");
    }

    // 2. Stories and comic script
    const stripFile = dir + "/strip.json";
    let data;
    if (!fs.existsSync(stripFile)) {
      const { stories, strip } = await writeStory({
        reporter: { name: f.name, city: f.city },
        highlights: f.highlights,
      });
      data = { friend: { id: f.id, name: f.name, city: f.city, style: f.style, sign: f.sign }, stories, strip };
      fs.writeFileSync(stripFile, JSON.stringify(data, null, 2));
      console.log("  story done at " + secs() + ": " + strip.title);
    } else {
      data = JSON.parse(fs.readFileSync(stripFile, "utf8"));
      console.log("  story already made, skipping");
    }

    // 3. The 4 panels at the same time (skips any that already exist)
    const results = await Promise.allSettled(
      data.strip.panels.map(async (p, i) => {
        const file = dir + "/scene-" + (i + 1) + ".png";
        if (fs.existsSync(file)) return;
        const bytes = await drawPanel({ avatarPath: portrait, style: f.style, scene: p.scene, mood: p.mood });
        fs.writeFileSync(file, bytes);
      })
    );
    const failed = results.filter((r) => r.status === "rejected");
    failed.forEach((r) => console.log("  a panel FAILED - " + (r.reason?.message ?? r.reason)));
    console.log("  panels done at " + secs() + (failed.length ? " (" + failed.length + " failed, run the script again)" : ""));

    manifest.push({ id: f.id, name: f.name, style: f.style, sign: f.sign, folder: dir, complete: failed.length === 0 });
  } catch (err) {
    console.log("  FAILED - " + (err?.message ?? err) + " (run the script again to finish this one)");
    manifest.push({ id: f.id, name: f.name, style: f.style, sign: f.sign, folder: dir, complete: false });
  }
}

fs.writeFileSync("seed-data/manifest.json", JSON.stringify(manifest, null, 2));
const done = manifest.filter((m) => m.complete).length;
console.log("\n" + done + " of " + FRIENDS.length + " friends complete, in " + secs() + ". Run 'explorer seed-data' to look.");
