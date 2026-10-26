import OpenAI from "openai";

// This is the phone number of Meta's AI, plus your secret key
const client = new OpenAI({
  apiKey: process.env.META_API_KEY,
  baseURL: "https://api.meta.ai/v1",
});

// Ask the AI (Muse Spark) to write a newspaper headline
const response = await client.chat.completions.create({
  model: "muse-spark-1.1",
  messages: [
    { role: "user", content: "Write a funny newspaper headline for: I adopted a dog." },
  ],
});

// Print the answer
console.log(JSON.stringify(response, null, 2));