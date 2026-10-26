import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: process.env.META_API_KEY,
  baseURL: "https://api.meta.ai/v1",
});

console.log("Drawing your avatar... this can take 10-30 seconds");

const response = await client.images.edit({
  model: "muse-image-1.0",
  image: fs.createReadStream("selfie.jpg"),
  prompt:
    "Turn the person in this photo into a cartoon avatar for a newspaper comic strip. " +
    "Head and shoulders, bold ink outlines, flat halftone shading, warm limited color palette, plain light background. " +
    "Keep their hairstyle, hair color, skin tone, glasses and other distinctive features recognizable.",
});

const image = response.data[0];

if (image.b64_json) {
  fs.writeFileSync("avatar.png", Buffer.from(image.b64_json, "base64"));
  console.log("Saved avatar.png! Click it in the file list to see it.");
} else if (image.url) {
  console.log("Your avatar is here:", image.url);
} else {
  console.log("Got a reply but no image:", JSON.stringify(response, null, 2).slice(0, 1500));
}