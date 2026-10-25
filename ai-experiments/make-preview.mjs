import fs from "fs";
import { writePreview } from "./preview.mjs";

// Builds the preview page from your most recent test-full.mjs run.
// No AI calls, so it's free and instant:
//   node make-preview.mjs

const files = fs.readdirSync(".");

const storyFile = files
  .filter((f) => /^story-\d+\.json$/.test(f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

if (!storyFile) {
  console.log("No story-....json file found. Run test-full.mjs first.");
  process.exit(1);
}

const stamp = storyFile.match(/^story-(\d+)\.json$/)[1];
const suffix = "-" + stamp + "-1.png";
const firstPanel = files.find((f) => f.startsWith("full-") && f.endsWith(suffix));

if (!firstPanel) {
  console.log("Found " + storyFile + " but no panel pictures from that run (full-...-" + stamp + "-1.png).");
  process.exit(1);
}

const style = firstPanel.slice("full-".length, firstPanel.length - suffix.length);
const data = JSON.parse(fs.readFileSync(storyFile, "utf8"));

const out = writePreview({
  reporterName: data.reporter?.name || "Alex",  stories: data.stories,
  strip: data.strip,
  style,
  stamp,
});

console.log("Made " + out + " from " + storyFile + " and the " + style + " panels.");
console.log("Open it with:  start " + out);
