import { z } from "zod";

// Invisible and direction-override characters that enable spoofing or hide content.
// ZWJ (U+200D) and ZWNJ (U+200C) are kept: emoji sequences and several scripts need them.
const INVISIBLES = /[\u00AD\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
// C0 and C1 control characters, except tab and newline (handled separately).
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export type TextMode = "single-line" | "multiline";

/** Canonical form for all user text: NFC, no controls or invisibles, normalized whitespace, trimmed. */
export function cleanText(input: string, mode: TextMode): string {
  let s = input
    .normalize("NFC")
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(CONTROLS, "")
    .replace(INVISIBLES, "");
  if (mode === "single-line") {
    s = s.replace(/\s+/g, " ");
  } else {
    s = s
      .replace(/[^\S\n]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  }
  return s.trim();
}

/** Length in Unicode code points, so emoji and non-Latin scripts are not double counted. */
export function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

interface TextFieldOptions {
  max: number;
  min?: number;
  mode?: TextMode;
  description?: string;
}

/**
 * A user-supplied text field. Raw input is capped before any processing so huge strings are
 * rejected cheaply, then cleaned, then length-checked in code points.
 */
export function textField({ max, min = 1, mode = "single-line", description }: TextFieldOptions) {
  const rawMax = max * 4 + 64;
  return z
    .string()
    .max(rawMax)
    .transform((v) => cleanText(v, mode))
    .pipe(
      z
        .string()
        .refine((v) => codePointLength(v) >= min, { message: min === 1 ? "Required" : `Minimum ${min}` })
        .refine((v) => codePointLength(v) <= max, { message: `Maximum ${max}` }),
    )
    .meta({
      description: `${description ? `${description} ` : ""}Plain text, ${min} to ${max} characters after cleaning.`,
      minLength: min,
      maxLength: max,
    });
}

export const TEXT_LIMITS = {
  personName: 60,
  paperName: 60,
  highlight: 500,
  headline: 120,
  article: 600,
  avatarNote: 80,
  geocodeQuery: 80,
} as const;
