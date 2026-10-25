import OpenAI from "openai";
import fs from "fs";
import { STYLE_KEYS, AVATAR_PROMPTS, AVATAR_SUFFIX, normalizeStyle } from "./styles.mjs";

const client = new OpenAI({
  apiKey: process.env.META_API_KEY,
  baseURL: "https://api.meta.ai/v1",
});

// Run with no extras to draw all 4 styles, or name the ones you want:
//   node --env-file=.env.local test-styles.mjs manga sketch
const requested = process.argv.slice(2);
const styles = requested.length ? requested.map(normalizeStyle) : STYLE_KEYS;

// Each run saves under a new name (with the time), so old pictures never block new ones.
const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");

console.log("Drawing your avatar in: " + styles.join(", ") + " ... about 30 seconds");
const started = Date.now();

const results = await Promise.allSettled(
  styles.map(async (style) => {
    const response = await client.images.edit({
      model: "muse-image-1.0",
      image: fs.createReadStream("selfie.jpg"),
      prompt: AVATAR_PROMPTS[style] + " " + AVATAR_SUFFIX,
    });
    const image = response.data[0];
    const bytes = image.b64_json
      ? Buffer.from(image.b64_json, "base64")
      : Buffer.from(await (await fetch(image.url)).arrayBuffer());
    const file = "avatar-" + style + "-" + stamp + ".png";
    fs.writeFileSync(file, bytes);
    return file + " (done at " + ((Date.now() - started) / 1000).toFixed(0) + "s)";
  })
);

results.forEach((r, i) => {
  const style = styles[i];
  if (r.status === "fulfilled") console.log(style + ": saved " + r.value);
  else console.log(style + ": FAILED - " + (r.reason?.message ?? r.reason));
});
