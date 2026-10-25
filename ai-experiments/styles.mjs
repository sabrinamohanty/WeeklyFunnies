// Shared prompt settings for The Weekly Funnies.
// Source: the frontend team's style prompts and backend spec, tuned from test results.
// Style keys: classic, manga, superhero, sketch.
// The frontend app code currently calls the superhero style "hero",
// so normalizeStyle() accepts both.

export const STYLE_KEYS = ["classic", "manga", "superhero", "sketch"];

export function normalizeStyle(key) {
  if (key === "hero") return "superhero";
  return STYLE_KEYS.includes(key) ? key : "classic";
}

// Full prompts for turning a selfie into the avatar (square portrait).
export const AVATAR_PROMPTS = {
  classic:
    "Transform the person in the reference selfie into an original vintage Sunday newspaper comic-strip character. Use bold black ink outlines, simplified facial features, expressive eyes, playful expressions, flat pastel colors, and subtle halftone printing textures. Draw inspiration from mid-century newspaper illustration techniques without copying any existing characters. Preserve the person's hairstyle, hair color, skin tone, face shape, glasses, and other identifying features. Show a friendly head-and-shoulders portrait against a softly colored, dotted background. Use a clean, charming, nostalgic illustration style.",

  superhero:
    "Transform the person in the reference selfie into an original character illustrated in a vintage American superhero comic-book art style. Use strong black ink outlines, detailed crosshatching, bold shadows, dramatic lighting, expressive facial features, and vibrant printed colors. Give the character a confident, slightly dynamic pose while keeping their normal everyday clothing. Preserve their recognizable facial structure, hairstyle, skin tone, and accessories. Incorporate subtle retro comic printing textures and dramatic but natural shading. Create a head-and-shoulders portrait with a simple illustrated background. Do not add superhero costumes, masks, emblems, or recognizable franchise elements.",

  manga:
    "Transform the person in the reference selfie into an original black-and-white Japanese anime and manga-style character portrait. Keep the person clearly recognizable: preserve their real face shape, nose shape, lip shape, eye shape and spacing, eyebrows, hairstyle and hair texture (for example curls, coils, braids, locs, waves or straight hair), glasses, accessories and every distinctive feature. Show their real skin tone through screentone and grayscale shading: darker skin must be drawn with medium to dark screentone and shadow tones and must never be left white or lightened, and lighter skin gets light tone. Never change or blur the person's apparent race or ethnicity. Give it the anime look through the drawing style only: large, glossy anime eyes with sparkling highlights and expressive lashes that still follow the person's own eye shape, clean confident ink linework, shiny stylized hair with highlight streaks, delicate blush lines, and traditional screentone shading with halftone dot patterns. Use a warm, friendly expression. Use a simple background with sparkles or screentone effects. Show the character from the shoulders upward, wearing their original everyday clothing. Avoid recognizable characters, forehead protectors, franchise symbols, or distinctive copyrighted costume designs.",

  sketch:
    "Transform the person in the reference selfie into an original loose ink-and-watercolor sketchbook portrait that is only lightly painted. Start from confident, loose ink and pencil contour lines that clearly define the face, hair and shoulders, with a few visible construction lines and slightly unfinished edges. Add color the way a quick travel sketch does: a few thin, flat, translucent watercolor washes in a limited muted palette, applied only to the main shapes (hair, skin, clothing) and left incomplete, with large areas of bare white paper showing through. Keep the paint minimal and light: no thick or opaque paint, no heavy blending, no detailed rendering, no smooth gradients across the whole image, no dark saturated fills. The drawing carries the likeness and the color is only a light tint on top. Preserve the person's recognizable facial features, hairstyle and hair texture, expression, glasses, and clothing. Tint the skin with the person's real skin tone, and never leave it as bare paper. Create a head-and-shoulders portrait on cream sketchbook paper with a blank background or a single soft pale wash behind the figure.",
};

// Added to the end of every avatar prompt, in every style.
export const AVATAR_SUFFIX =
  "Generate exactly one centered, square 1:1 character portrait. Keep the character recognizable across future illustrations. Use a simple background, clear facial visibility, and consistent head-and-shoulders framing. No text, typography, logos, speech bubbles, borders, newspaper layout, watermarks, copyrighted characters, or franchise-specific visual elements. Maintain the selected illustration style consistently. Keep the person's real skin tone, facial features, face shape and hair texture exactly as in the reference. Never lighten, whiten or change their apparent race or ethnicity.";

// Short style descriptions, reused when drawing the weekly comic panels.
export const STYLE_FRAGMENTS = {
  classic:
    "original retro Sunday newspaper comic strip, bold black ink outlines, playful simplified expressions, flat warm pastel colors, subtle printed halftone texture, friendly mid-century editorial charm",
  manga:
    "original black-and-white anime-style manga illustration, large glossy sparkling eyes, clean confident ink linework, shiny stylized hair, grayscale screentone shading that keeps each character's real skin tone and features recognizable, cheerful slice-of-life storytelling",
  superhero:
    "original vintage American action-comic illustration, confident composition, heavy ink shadows, energetic linework, dramatic lighting, rich printed colors and halftone accents; everyday outfits, no costumes, masks, insignias or superhero emblems",
  sketch:
    "original loose ink-and-watercolor sketchbook illustration, confident ink and pencil contour lines, a few thin translucent flat washes in a limited muted palette, bare white paper showing, quick unfinished edges, only lightly painted",
};

// Added to the end of every comic panel prompt.
export const PANEL_SUFFIX =
  "Use entirely original characters and designs. Never reproduce a known comic, manga, film, game or superhero character, signature outfit, emblem, headband insignia, mask, weapon or franchise symbol. No typography, headlines, letters, signs, speech bubbles, captions, logos, watermark, newspaper masthead, layout or decorative border inside the generated image. Maintain the selected style and character identity across outputs. Keep each character's real skin tone, features and hair texture exactly as in the reference.";
