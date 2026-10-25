import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: process.env.META_API_KEY,
  baseURL: "https://api.meta.ai/v1",
});

console.log("Drawing the comic panel... this can take 10-30 seconds");

const response = await client.images.edit({
  model: "muse-image-1.0",
  image: fs.createReadStream("avatar.png"),
  prompt:
    "Using the cartoon character in the reference image, draw a single comic strip panel: " +
    "the character holding a brand-new puppy in a sunny living room, clearly excited. " +
    "Same art style as the reference: bold ink outlines, flat halftone shading, warm limited color palette. " +
    "The character must look exactly like the one in the reference image. " +
    "No text, no speech bubbles, no captions.",
});

const image = response.data[0];

if (image.b64_json) {
  fs.writeFileSync("panel.png", Buffer.from(image.b64_json, "base64"));
  console.log("Saved panel.png! Open it with: start panel.png");
} else if (image.url) {
  console.log("Your panel is here:", image.url);
} else {
  console.log("Got a reply but no image:", JSON.stringify(response, null, 2).slice(0, 1500));
}