import type { ImageBytes } from "./types";

export const MAX_GENERATED_IMAGE_BYTES = 10 * 1024 * 1024;

function sniff(b: Uint8Array): ImageBytes["mimeType"] | undefined {
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

/** True if the bytes are a PNG, JPEG, or WebP whose content matches the declared type and size cap. */
export function isValidImage(img: ImageBytes | undefined): img is ImageBytes {
  if (!img || !(img.bytes instanceof Uint8Array)) return false;
  if (img.bytes.length === 0 || img.bytes.length > MAX_GENERATED_IMAGE_BYTES) return false;
  return sniff(img.bytes) === img.mimeType;
}
