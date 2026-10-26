import fs from "fs";
import { writeStory, drawPanel } from "./ai.mjs";
import { normalizeStyle } from "./styles.mjs";
import { writePreview } from "./preview.mjs";

// Run the whole loop for one person:
//   node --env-file=.env.local test-full.mjs manga
const style = normalizeStyle(process.argv[2] || "classic");

// Use the newest avatar picture saved for that style
const avatarFile = fs
  .readdirSync(".")
  .filter((f) => f.startsWith("avatar-" + style) && f.endsWith(".png"))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

if (!avatarFile) {
  console.log("No avatar found for the " + style + " style. Run test-styles.mjs for that style first.");
  process.exit(1);
}

const reporter = { name: "Alex", city: "Austin" };
const highlights = [
  { id: "h1", text: "Adopted a puppy named Biscuit from the shelter on Tuesday!", serious: false, inComic: true },
  { id: "h2", text: "Finished my first 5K at Lady Bird Lake and ate way too many tacos after.", serious: false, inComic: true },
  { id: "h3", text: "My grandma had surgery this week and is recovering well.", serious: true, inComic: false },
];

const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";

console.log("Using " + avatarFile + " in the " + style + " style");
console.log("\nStep 1: writing the stories and the comic script...");
const { stories, strip } = await writeStory({ reporter, highlights });
console.log("Done at " + secs() + "\n");

stories.forEach((s) => {
  console.log("[" + s.section + "] " + s.headline);
  console.log("  " + s.article);
});
console.log("\nComic: " + strip.title);
strip.panels.forEach((p, i) => {
  console.log("  Panel " + (i + 1) + " (" + p.highlightId + ", " + p.mood + ")");
  console.log("    scene:   " + p.scene);
  console.log("    speech:  " + (p.dialogue.length ? p.dialogue.join(" / ") : "(none)"));
  console.log("    caption: " + p.caption);
});

fs.writeFileSync("story-" + stamp + ".json", JSON.stringify({ reporter, stories, strip }, null, 2));

console.log("\nStep 2: drawing the 4 panels at the same time...");
const results = await Promise.allSettled(
  strip.panels.map(async (p, i) => {
    const bytes = await drawPanel({ avatarPath: avatarFile, style, scene: p.scene, mood: p.mood });
    const file = "full-" + style + "-" + stamp + "-" + (i + 1) + ".png";
    fs.writeFileSync(file, bytes);
    return file + " (" + bytes.readUInt32BE(16) + "x" + bytes.readUInt32BE(20) + ", done at " + secs() + ")";
  })
);
results.forEach((r, i) => {
  if (r.status === "fulfilled") console.log("Panel " + (i + 1) + ": saved " + r.value);
  else console.log("Panel " + (i + 1) + ": FAILED - " + (r.reason?.message ?? r.reason));
});

const previewFile = writePreview({ reporterName: reporter.name, stories, strip, style, stamp });
console.log("\nWhole loop finished in " + secs() + ".");
console.log("See it as a page:  start " + previewFile);
