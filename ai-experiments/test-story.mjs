import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.META_API_KEY,
  baseURL: "https://api.meta.ai/v1",
});

const reporter = { name: "Alex", city: "Austin" };
const highlights = [
  { id: "h1", text: "Adopted a puppy named Biscuit from the shelter on Tuesday!", serious: false, inComic: true },
  { id: "h2", text: "Finished my first 5K at Lady Bird Lake and ate way too many tacos after.", serious: false, inComic: true },
  { id: "h3", text: "My grandma had surgery this week and is recovering well.", serious: true, inComic: false },
];

const system = `You are the staff writer for a friendly weekly newspaper about a friend group.
You get a reporter and up to 3 highlights from their week. Reply with ONLY valid JSON in this shape:
{"stories":[{"highlightId":"","section":"","headline":"","article":""}],
 "strip":{"title":"","panels":[{"highlightId":"","scene":"","caption":"","mood":""}]}}

Rules:
- Use ONLY facts in the highlight text. Never invent names, places, numbers or events.
- One story per highlight. Headline: playful newspaper style, max 10 words. Article: 2-3 sentences, third person, using the reporter's first name.
- If a highlight has serious=true: warm and plain, no puns or jokes in the headline or article.
- section is one word like Pets, Sports, News, Campus, Food, Family, Travel or Life.
- The strip has EXACTLY 4 panels, built only from highlights with inComic=true. If there are fewer than 4 such highlights, split them into story beats. Highlights with inComic=false get a story but no panel.
- scene: describe what the picture shows (the character's action, setting, expression). No text in the picture.
- caption: max 10 words, a funny quote or narration line.
- mood must be one of: o, smile, flat, grin.
- strip.title: max 5 words.
- Never say the same fact twice. If a highlight is short, write 1-2 sentences, not 3.
- Don't add facts. In scenes, no pet colors, breeds, ages or names unless the highlight says so, and neutral background details are fine. Captions can be playful but must not claim things that didn't happen.`;

const response = await client.chat.completions.create({
  model: "muse-spark-1.1",
  messages: [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ reporter, highlights }) },
  ],
});

const raw = response.choices[0].message.content ?? "";
try {
  const data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  console.log(JSON.stringify(data, null, 2));
} catch {
  console.log("Couldn't read it as JSON. Here's what came back:\n", raw);
}