/**
 * Heuristic check that generated text doesn't introduce names, places, or numbers that the person
 * never wrote. It flags capitalized words and numbers that are absent from the input.
 *
 * Limits: scripts without letter case (CJK, Arabic, Devanagari, ...) only get the number check,
 * and invented facts written in lowercase aren't caught. The system prompt is the first line of
 * defence; this is the backstop.
 */

// Common sentence openers. A capitalized word at the start of a sentence is only flagged if it isn't
// one of these and isn't in the input.
const OPENERS = new Set(
  (
    "a an the this that these those it its it's he she they we you i his her their our my your " +
    "after before during while when then now today tonight yesterday later finally first next also " +
    "and but so yet or because since although though if as at by for from in into of on onto over " +
    "to under up with without about around between through across against along among " +
    "what who how why where which there here some all every each both many most more few " +
    "nothing something everything anything one another just still even only not no yes " +
    "despite even meanwhile together sometimes always never often"
  ).split(" "),
);

const CAPITALIZED = /(?<![\p{L}\p{M}\p{N}])\p{Lu}[\p{L}\p{M}\p{N}'’-]*/gu;
const NUMBER = /(?<![\p{N}])\p{N}+(?:[.,:/]\p{N}+)*/gu;
const SENTENCE_START = /(^|[.!?:;]\s+|\n\s*|["“(]\s*)$/;

const WORD = /[\p{L}\p{M}\p{N}'’-]+/gu;

function fold(s: string): string {
  return s.normalize("NFC").toLocaleLowerCase();
}

function stem(word: string): string {
  return fold(word)
    .replace(/['’]s$/, "")
    .replace(/^[-'’]+|[-'’]+$/g, "");
}

function wordsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(WORD)) {
    const w = stem(m[0]);
    out.add(w);
    for (const part of w.split(/[-'’]/)) if (part) out.add(part);
  }
  return out;
}

export interface GroundingIssue {
  kind: "name" | "number";
  /** Character offset within the checked text. Never the text itself, so it can be logged. */
  at: number;
}

export function findUngrounded(output: string, input: string, allowed: string[] = []): GroundingIssue[] {
  const source = fold(input);
  const sourceWords = wordsOf(input);
  const allow = new Set(allowed.filter(Boolean).map(stem));
  const issues: GroundingIssue[] = [];

  for (const m of output.matchAll(CAPITALIZED)) {
    const word = stem(m[0]);
    if (!word || allow.has(word) || word === "i" || /^i['’]/.test(word)) continue;
    if (sourceWords.has(word)) continue;
    const atStart = SENTENCE_START.test(output.slice(0, m.index));
    if (atStart && OPENERS.has(word)) continue;
    issues.push({ kind: "name", at: m.index });
  }

  const sourceNumbers = new Set<string>();
  for (const m of source.matchAll(NUMBER)) {
    sourceNumbers.add(m[0]);
    for (const part of m[0].split(/[.,:/]/)) sourceNumbers.add(part);
  }
  for (const m of output.matchAll(NUMBER)) {
    if (!sourceNumbers.has(m[0])) issues.push({ kind: "number", at: m.index });
  }
  return issues;
}
