// Deterministic text checks that run before and after any model call. No network, no models.

const TLDS =
  "com|net|org|io|co|app|dev|me|ly|gg|xyz|info|biz|edu|gov|tv|ai|so|to|link|site|online|shop|uk|us|ca|de|fr|es|it|nl|au|in|jp|cn|br|ru|gh|ng|ke|za";

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const URL_SCHEME = /\b(?:https?|ftp|file|javascript|data|mailto|tel|sms|ws|wss):\S+/giu;
const URL_WWW = /\bwww\.\S+/giu;
const BARE_DOMAIN = new RegExp(
  `(?<![\\p{L}\\p{N}@-])[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:${TLDS})(?![\\p{L}\\p{N}])(?:[/?#]\\S*)?`,
  "giu",
);
const PHONES = [
  /\+\d[\d\s().-]{6,}\d/g, // international
  /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, // 415-555-0199, (415) 555-0199
  /\b0\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g, // 024 123 4567
];

export type RedactionKind = "email" | "link" | "phone";

/**
 * Replaces emails, links, and phone numbers with placeholders, so they never reach a provider.
 * The stored source text keeps what the user typed; only what goes out is redacted.
 */
export function redactPersonalData(text: string): { text: string; found: RedactionKind[] } {
  const found = new Set<RedactionKind>();
  let s = text.replace(EMAIL, () => (found.add("email"), "[email]"));
  for (const re of [URL_SCHEME, URL_WWW, BARE_DOMAIN]) s = s.replace(re, () => (found.add("link"), "[link]"));
  for (const re of PHONES) s = s.replace(re, () => (found.add("phone"), "[phone]"));
  return { text: s, found: [...found] };
}

export function containsLink(text: string): boolean {
  return [EMAIL, URL_SCHEME, URL_WWW, BARE_DOMAIN].some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

// Generated text is plain. These characters and sequences only appear in markup, templates, or code.
const MARKUP = [
  /[<>{}[\]`\\|]/,
  /\*\*|__|~~/,
  /(^|\n)\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s/,
  /\$\{|\{\{/,
  /&[a-z]+;|&#\d+;/i,
];

export function containsMarkup(text: string): boolean {
  return MARKUP.some((re) => re.test(text));
}

/**
 * Keeps letters, marks, numbers, spaces, and basic punctuation. Used for anything placed inside an
 * image prompt template, so no field can carry markup, delimiters, or template syntax.
 */
export function toPromptSafe(text: string, max: number): string {
  const safe = text
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N} ,.'’!?-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(safe).slice(0, max).join("").trim();
}
