import { createHmac, randomBytes } from "node:crypto";
import { INVITE_CODE_LENGTH } from "@/lib/contract/papers";

// Crockford base32: no I, L, O, or U, so codes are easy to read aloud and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A new random invite code: 12 characters, 60 bits of entropy. Uniform because 256 is a multiple of 32. */
export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (const b of bytes) code += ALPHABET[b & 31];
  return code;
}

/** XXXX-XXXX-XXXX, for display. */
export function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/** HMAC of the normalized code with a server-side pepper. Only this hash is stored. */
export function hashInviteCode(normalizedCode: string, pepper: string): string {
  return createHmac("sha256", pepper).update(normalizedCode).digest("hex");
}
