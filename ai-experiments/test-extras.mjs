import fs from "fs";
import { drawAvatar, rewriteStory } from "./ai.mjs";

// Tests the three things we haven't tried yet, all at the same time:
//   1. the Rewrite button (a fresh headline for one highlight)
//   2. avatar tweaks (hair color, glasses, outfit color) on your selfie
//   3. an avatar drawn from words only, with no selfie
//   node --env-file=.env.local test-extras.mjs

const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
const started = Date.now();
const secs = () => ((Date.now() - started) / 1000).toFixed(0) + "s";

const reporter = { name: "Alex", city: "Austin" };
const highlight = {
  id: "h1",
  text: "Adopted a puppy named Biscuit from the shelter on Tuesday!",
  serious: false,
  inComic: true,
};

console.log("Testing 3 things at the same time... about 30 seconds\n");

const [rewrite, tweaked, fromWords] = await Promise.allSettled([
  rewriteStory({ reporter, highlight, previousHeadline: "Alex Welcomes Biscuit Home From Shelter" }),
  drawAvatar({
    selfiePath: "selfie.jpg",
    style: "classic",
    tweaks: { hairColor: "bright red", glasses: true, outfitColor: "blue" },
  }),
  drawAvatar({
    style: "classic",
    traits: "a friendly person with short curly black hair and warm brown skin",
  }),
]);

if (rewrite.status === "fulfilled") {
  console.log("1. Rewrite worked:");
  console.log("   " + rewrite.value.headline);
  console.log("   " + rewrite.value.article + "\n");
} else {
  console.log("1. Rewrite FAILED - " + (rewrite.reason?.message ?? rewrite.reason) + "\n");
}

if (tweaked.status === "fulfilled") {
  const file = "extra-tweaked-" + stamp + ".png";
  fs.writeFileSync(file, tweaked.value);
  console.log("2. Tweaks worked: saved " + file + " (red hair, glasses, blue top)");
} else {
  console.log("2. Tweaks FAILED - " + (tweaked.reason?.message ?? tweaked.reason));
}

if (fromWords.status === "fulfilled") {
  const file = "extra-fromwords-" + stamp + ".png";
  fs.writeFileSync(file, fromWords.value);
  console.log("3. No-selfie avatar worked: saved " + file);
} else {
  console.log("3. No-selfie avatar FAILED - " + (fromWords.reason?.message ?? fromWords.reason));
}

console.log("\nDone in " + secs() + ". Run 'explorer .' to see the pictures.");
