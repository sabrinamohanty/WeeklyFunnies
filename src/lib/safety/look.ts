import type { AvatarTraits } from "@/lib/contract/profile";
import { toPromptSafe } from "./redact";

export const LOOK_MAX = 200;

const words = (v: string) => v.replace(/_/g, " ");

const HAIR_STYLE: Record<NonNullable<AvatarTraits["hairStyle"]>, string> = {
  short: "short",
  medium: "medium-length",
  long: "long",
  wavy: "wavy",
  curly: "curly",
  coily: "coily",
  braids: "braided",
  locs: "loc'd",
  buzzed: "buzzed",
  bald: "bald",
};

const SKIN: Record<NonNullable<AvatarTraits["skinTone"]>, string> = {
  very_light: "very light skin",
  light: "light skin",
  medium: "medium skin",
  tan: "tan skin",
  brown: "brown skin",
  dark: "dark skin",
};

const TOP: Record<NonNullable<AvatarTraits["top"]>, string> = {
  tshirt: "t-shirt",
  hoodie: "hoodie",
  sweater: "sweater",
  jacket: "jacket",
  shirt: "button-up shirt",
  dress: "dress",
  jersey: "sports jersey",
};

/**
 * The fixed character description reused in every panel prompt. Built only from enum values and a
 * note that the caller has already moderated; the note is reduced to safe characters here.
 */
export function buildLook(traits: AvatarTraits, moderatedNote?: string): string {
  const parts: string[] = [];
  if (traits.hairStyle === "bald") parts.push("bald head");
  else if (traits.hairStyle || traits.hairColor) {
    const style = traits.hairStyle ? HAIR_STYLE[traits.hairStyle] : "";
    const color = traits.hairColor
      ? traits.hairColor === "dyed"
        ? "brightly dyed"
        : words(traits.hairColor)
      : "";
    parts.push([style, color, "hair"].filter(Boolean).join(" "));
  }
  if (traits.skinTone) parts.push(SKIN[traits.skinTone]);
  if (traits.facialHair && traits.facialHair !== "none") parts.push(traits.facialHair);
  if (traits.glasses && traits.glasses !== "none") {
    parts.push(traits.glasses === "sunglasses" ? "sunglasses" : `${traits.glasses} glasses`);
  }
  if (traits.headwear && traits.headwear !== "none") parts.push(`a ${traits.headwear}`);
  if (traits.top) parts.push([traits.topColor, TOP[traits.top]].filter(Boolean).join(" "));
  const note = moderatedNote ? toPromptSafe(moderatedNote, 80) : "";
  if (note) parts.push(note);
  const look = parts.join(", ") || "a friendly person";
  return Array.from(look).slice(0, LOOK_MAX).join("");
}
