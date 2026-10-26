import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: process.env.META_API_KEY,
  baseURL: "https://api.meta.ai/v1",
});

// Try each of these later: classic, manga, hero, sketch
const STYLE = "classic";

const STYLES = {
  classic: "Classic newspaper comic strip style: bold black ink outlines, flat colors, halftone dot shading, warm limited color palette.",
  manga: "Manga style: black and white ink with screentone shading, expressive eyes, clean dynamic linework.",
  hero: "Superhero comic book style: bold inks, dramatic lighting, saturated primary colors, dynamic angles, heavy shadows.",
  sketch: "Pencil and ink sketch style: loose hand-drawn lines, cross-hatching shading, soft paper texture, muted colors.",
};

// The 4 scenes from your writer test
const scenes = [
  "Alex kneeling inside a shelter looking at a small puppy in a kennel, smiling",
  "Alex walking out of shelter doors carrying the puppy in arms, happy expression",
  "Alex crossing a finish line on a lakeside trail, arms raised, tired and joyful",
  "Alex sitting at a table with empty taco wrappers, holding stomach, content",
];

console.log(`Drawing 4 panels in "${STYLE}" style at the same time... this can take 30-60 seconds`);
const started = Date.now();

const results = await Promise.allSettled(
  scenes.map(async (scene, i) => {
    const response = await client.images.edit({
      model: "muse-image-1.0",
      image: fs.createReadStream("avatar.png"),
      prompt:
        `Draw a single comic strip panel. The main character, Alex, is the cartoon character in the reference image. ` +
        `Scene: ${scene}. ${STYLES[STYLE]} ` +
        `Alex must look exactly like the reference character: same face, hair, skin tone, glasses and clothing colors. ` +
        `No text, no speech bubbles, no captions, no watermark.`,
    });
    const image = response.data[0];
    const bytes = image.b64_json
      ? Buffer.from(image.b64_json, "base64")
      : Buffer.from(await (await fetch(image.url)).arrayBuffer());
    fs.writeFileSync(`strip-${i + 1}.png`, bytes);
    return `${((Date.now() - started) / 1000).toFixed(0)}s`;
  })
);

results.forEach((r, i) => {
  if (r.status === "fulfilled") console.log(`Panel ${i + 1}: saved strip-${i + 1}.png (done at ${r.value})`);
  else console.log(`Panel ${i + 1}: FAILED -`, r.reason?.message ?? r.reason);
});