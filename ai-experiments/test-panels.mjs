import OpenAI from "openai";
import fs from "fs";
import { STYLE_FRAGMENTS, PANEL_SUFFIX, normalizeStyle } from "./styles.mjs";

const client = new OpenAI({
  apiKey: process.env.META_API_KEY,
  baseURL: "https://api.meta.ai/v1",
});

// Pick a style when you run it:
//   node --env-file=.env.local test-panels.mjs manga
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
console.log("Using " + avatarFile + " as the character reference");

// The 4 scenes from the writer test
const scenes = [
  "the character kneeling inside an animal shelter looking at a small puppy in a kennel, smiling",
  "the character walking out of the shelter doors carrying the puppy in their arms, happy expression",
  "the character crossing a finish line on a lakeside trail, arms raised, tired and joyful",
  "the character sitting at a table with empty taco wrappers, holding their stomach, content",
];

const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
const started = Date.now();

async function drawPanel(scene) {
  const prompt =
    "Draw a single comic strip panel. The main character is the person in the reference image: keep their face, hair, skin tone, glasses and clothing exactly as drawn there. " +
    "Scene: " + scene + ". " +
    "Art style: " + STYLE_FRAGMENTS[style] + ". " +
    "Wide landscape 4:3 composition with some empty space left for captions that will be added later. " +
    PANEL_SUFFIX;

  const make = (extra) =>
    client.images.edit({
      model: "muse-image-1.0",
      image: fs.createReadStream(avatarFile),
      prompt,
      ...extra,
    });

  let response;
  try {
    response = await make({ size: "1536x1024" });
  } catch (err) {
    console.log("Landscape size not accepted (" + (err?.message ?? err) + "). Trying the default size.");
    response = await make({});
  }
  const image = response.data[0];
  return image.b64_json
    ? Buffer.from(image.b64_json, "base64")
    : Buffer.from(await (await fetch(image.url)).arrayBuffer());
}

console.log("Drawing 4 panels in the " + style + " style at the same time... about 30-60 seconds");

const results = await Promise.allSettled(
  scenes.map(async (scene, i) => {
    const bytes = await drawPanel(scene);
    const file = "panel-" + style + "-" + stamp + "-" + (i + 1) + ".png";
    fs.writeFileSync(file, bytes);
    // PNG files store their width and height near the start
    const size = bytes.readUInt32BE(16) + "x" + bytes.readUInt32BE(20);
    return file + " (" + size + ", done at " + ((Date.now() - started) / 1000).toFixed(0) + "s)";
  })
);

results.forEach((r, i) => {
  if (r.status === "fulfilled") console.log("Panel " + (i + 1) + ": saved " + r.value);
  else console.log("Panel " + (i + 1) + ": FAILED - " + (r.reason?.message ?? r.reason));
});
