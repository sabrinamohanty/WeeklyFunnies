// The user's chosen style is a key into this object; the fragment is added to every avatar and panel
// prompt. Describe the look, never name artists or existing properties.
export const STYLES = {
  classic:
    'vintage Sunday newspaper comic strip, clean ink linework, flat limited colors, warm off-white paper tone, simple expressive characters',
  manga:
    'black and white manga, crisp ink linework, screentone shading, expressive eyes, dynamic camera angles',
  sketch:
    'loose pencil sketch, visible hatching and construction lines, unfinished edges, soft graphite shading',
  superhero:
    'bold American superhero comic, heavy ink shadows, dramatic lighting, halftone dots, saturated colors',
} as const

export type StyleKey = keyof typeof STYLES
export const STYLE_KEYS = Object.keys(STYLES) as [StyleKey, ...StyleKey[]]
