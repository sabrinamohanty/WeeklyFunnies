import sharp from "sharp";
import { ApiError } from "@/lib/http/errors";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_DIMENSION = 8192;

export type UploadKind = "image/jpeg" | "image/png";

export interface ProcessedImage {
  bytes: Buffer;
  mimeType: UploadKind;
  ext: "jpg" | "png";
  width: number;
  height: number;
}

function sniff(bytes: Uint8Array): UploadKind | undefined {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v)) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return undefined;
}

/**
 * Accepts a JPEG or PNG, checks size and dimensions, applies EXIF orientation, and re-encodes
 * so GPS and other metadata are stripped. SVG, WebP, and executables are rejected by magic bytes.
 */
export async function processUpload(bytes: Uint8Array): Promise<ProcessedImage> {
  if (bytes.byteLength === 0) throw new ApiError("unsupported_media");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ApiError("payload_too_large");
  const kind = sniff(bytes);
  if (!kind) throw new ApiError("unsupported_media");

  const decode = () =>
    sharp(bytes, { failOn: "error", limitInputPixels: MAX_DIMENSION * MAX_DIMENSION }).rotate();
  const meta = await decode().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ApiError("bad_request", { details: [{ path: "body.photo", issue: "invalid_dimensions" }] });
  }

  const out =
    kind === "image/jpeg"
      ? await decode().jpeg({ quality: 85, mozjpeg: true }).toBuffer()
      : await decode().png({ compressionLevel: 9 }).toBuffer();

  // Re-read after rotate/re-encode so stored width/height match the file.
  const final = await sharp(out).metadata();
  return {
    bytes: out,
    mimeType: kind,
    ext: kind === "image/jpeg" ? "jpg" : "png",
    width: final.width ?? width,
    height: final.height ?? height,
  };
}
