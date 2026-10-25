import { ApiError } from "./errors";

export const DEFAULT_JSON_MAX_BYTES = 8 * 1024;

/** Reads the request body as bytes, failing as soon as it exceeds maxBytes. */
export async function readBodyBytes(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) throw new ApiError("bad_request");
    if (n > maxBytes) throw new ApiError("payload_too_large");
  }
  if (!req.body) return new Uint8Array(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError("payload_too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Reads and parses a JSON body. An empty body parses as {} so empty-object bodies are optional. */
export async function readJsonBody(req: Request, maxBytes = DEFAULT_JSON_MAX_BYTES): Promise<unknown> {
  const bytes = await readBodyBytes(req, maxBytes);
  if (bytes.byteLength === 0) return {};
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(type)) throw new ApiError("unsupported_media");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError("bad_request", { details: [{ path: "body", issue: "invalid_utf8" }] });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("bad_request", { details: [{ path: "body", issue: "invalid_json" }] });
  }
}
