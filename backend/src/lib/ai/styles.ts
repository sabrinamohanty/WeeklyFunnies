import type { StyleKey } from "@/lib/contract/common";
import type { StyleConfig } from "./types";

// Describe the look; never name artists or existing properties. Design owns this text.
export const STYLES: Record<StyleKey, string> = {
  classic:
    "vintage Sunday newspaper comic strip, clean ink linework, flat limited colors, warm off-white paper tone, simple expressive characters",
  manga:
    "black and white manga, crisp ink linework, screentone shading, expressive eyes, dynamic camera angles",
  sketch:
    "loose pencil sketch, visible hatching and construction lines, unfinished edges, soft graphite shading",
  superhero:
    "bold American superhero comic, heavy ink shadows, dramatic lighting, halftone dots, saturated colors",
};

export function styleConfig(key: StyleKey): StyleConfig {
  return { key, fragment: STYLES[key] };
}
