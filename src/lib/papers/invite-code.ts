import { createHmac, randomBytes } from "node:crypto";
import { INVITE_CODE_LENGTH } from "@/lib/contract/papers";

// Crockford base32: no I, L, O, or U, so codes are easy to read aloud and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A new random invite code: 6 characters, 30 bits of entropy. Uniform because 256 is a multiple of
 * 32. Short on purpose; guessing is held off by per-user and per-IP join limits, the 7-day expiry,
 * and the cap of 5 active codes per paper.
 */
export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (const b of bytes) code += ALPHABET[b & 31];
  return code;
}

/** HMAC of the normalized code with a server-side pepper. Only this hash is stored. */
export function hashInviteCode(normalizedCode: string, pepper: string): string {
  return createHmac("sha256", pepper).update(normalizedCode).digest("hex");
}
