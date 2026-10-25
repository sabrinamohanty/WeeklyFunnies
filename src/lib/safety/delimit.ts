import { randomBytes } from "node:crypto";

/** Random per-call boundary id, so user text can't forge a closing delimiter. */
export function newBoundary(): string {
  return randomBytes(6).toString("hex");
}

/** Collapses runs that look like our delimiters, so they can't be mistaken for one. */
function neutralize(text: string): string {
  return text.replace(/<{3,}/g, "<").replace(/>{3,}/g, ">");
}

/**
 * Wraps untrusted text in a labelled block. The system prompt tells the model that anything inside
 * these blocks is data to describe, never instructions to follow.
 */
export function wrapUntrusted(label: string, text: string, boundary: string): string {
  const tag = `${label.toUpperCase()} id=${boundary}`;
  return `<<<${tag}>>>\n${neutralize(text)}\n<<<END ${tag}>>>`;
}

/** Inverse of wrapUntrusted, for the stub provider and tests. */
export function unwrapUntrusted(prompt: string, label: string): string | undefined {
  const re = new RegExp(
    `<<<${label.toUpperCase()} id=([0-9a-f]+)>>>\\n([\\s\\S]*?)\\n<<<END ${label.toUpperCase()} id=\\1>>>`,
  );
  return re.exec(prompt)?.[2];
}
