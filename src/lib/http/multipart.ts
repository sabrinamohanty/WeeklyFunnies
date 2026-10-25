import { ApiError } from "./errors";

export interface MultipartFile {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface MultipartBody {
  fields: Record<string, string>;
  files: Record<string, MultipartFile>;
}

function boundaryOf(contentType: string): Uint8Array {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const raw = match?.[1] ?? match?.[2]?.trim();
  if (!raw) throw new ApiError("unsupported_media");
  return new TextEncoder().encode(raw);
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function headerMap(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function disposition(value: string): { name?: string; filename?: string } {
  const name = /(?:^|;)\s*name="([^"]+)"/i.exec(value)?.[1];
  const filename = /(?:^|;)\s*filename="((?:\\.|[^"])*)"/i.exec(value)?.[1]?.replace(/\\"/g, '"');
  return { name, filename };
}

function startsWith(bytes: Uint8Array, at: number, prefix: Uint8Array): boolean {
  if (at + prefix.length > bytes.length) return false;
  return prefix.every((b, i) => bytes[at + i] === b);
}

/**
 * Parses a multipart/form-data body on the raw bytes so binary uploads are not corrupted.
 * Field values are decoded as UTF-8.
 */
export function parseMultipart(bytes: Uint8Array, contentType: string): MultipartBody {
  const token = boundaryOf(contentType);
  const dashDash = new TextEncoder().encode("--");
  const crlf = new TextEncoder().encode("\r\n");
  const opener = new Uint8Array(dashDash.length + token.length);
  opener.set(dashDash, 0);
  opener.set(token, dashDash.length);
  const separator = new Uint8Array(crlf.length + opener.length);
  separator.set(crlf, 0);
  separator.set(opener, crlf.length);

  if (!startsWith(bytes, 0, opener)) {
    throw new ApiError("bad_request", { details: [{ path: "body", issue: "invalid_multipart" }] });
  }
  let offset = opener.length;
  if (startsWith(bytes, offset, crlf)) offset += crlf.length;

  const fields: Record<string, string> = {};
  const files: Record<string, MultipartFile> = {};
  const headerBreak = new TextEncoder().encode("\r\n\r\n");

  while (offset < bytes.length) {
    if (startsWith(bytes, offset, dashDash)) break;
    const next = indexOf(bytes, separator, offset);
    if (next === -1) {
      throw new ApiError("bad_request", { details: [{ path: "body", issue: "invalid_multipart" }] });
    }
    const chunk = bytes.subarray(offset, next);
    const splitAt = indexOf(chunk, headerBreak);
    if (splitAt !== -1) {
      const headers = headerMap(new TextDecoder().decode(chunk.subarray(0, splitAt)));
      const rawName = headers["content-disposition"];
      if (rawName) {
        const { name, filename } = disposition(rawName);
        if (name) {
          const part = chunk.subarray(splitAt + headerBreak.length);
          if (filename !== undefined) {
            files[name] = {
              filename,
              contentType: headers["content-type"] ?? "application/octet-stream",
              bytes: part,
            };
          } else {
            fields[name] = new TextDecoder().decode(part);
          }
        }
      }
    }
    offset = next + separator.length;
  }

  return { fields, files };
}

export function requireFile(body: MultipartBody, field: string): MultipartFile {
  const file = body.files[field];
  if (!file || file.bytes.byteLength === 0) {
    throw new ApiError("bad_request", { details: [{ path: `body.${field}`, issue: "required" }] });
  }
  return file;
}
