import { expect } from "vitest";
import type { z } from "zod";
import { type ErrorEnvelope, errorEnvelopeSchema } from "@/lib/contract/errors";
import type { RouteContract } from "@/lib/contract/routes";

type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

let ipCounter = 0;

/** Calls a route handler directly, the way Next would. Each call gets a distinct client IP by default. */
export async function call(
  handler: Handler,
  opts: {
    method: string;
    path: string;
    token?: string;
    body?: unknown;
    rawBody?: string;
    multipart?: {
      fields?: Record<string, string>;
      file?: { field: string; filename: string; type: string; bytes: Uint8Array };
    };
    params?: Record<string, string>;
    ip?: string;
  },
): Promise<Response> {
  const headers: Record<string, string> = {
    "x-real-ip": opts.ip ?? `10.0.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`,
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: string | Uint8Array | undefined;
  if (opts.multipart) {
    const boundary = "----vitestboundary";
    const chunks: Uint8Array[] = [];
    const push = (s: string) => chunks.push(new TextEncoder().encode(s));
    for (const [name, value] of Object.entries(opts.multipart.fields ?? {})) {
      push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    }
    if (opts.multipart.file) {
      const f = opts.multipart.file;
      push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.type}\r\n\r\n`,
      );
      chunks.push(f.bytes);
      push(`\r\n`);
    }
    push(`--${boundary}--\r\n`);
    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.length;
    }
    headers["content-type"] = `multipart/form-data; boundary=${boundary}`;
    body = bytes;
  } else if (opts.rawBody !== undefined || opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = opts.rawBody ?? JSON.stringify(opts.body);
  }
  const req = new Request(`http://localhost${opts.path}`, { method: opts.method, headers, body });
  return handler(req, { params: Promise.resolve(opts.params ?? {}) });
}

/** Asserts a success response and validates it against the route's contract schema. */
export async function expectOk<C extends RouteContract>(
  res: Response,
  contract: C,
): Promise<z.output<C["success"]["schema"]>> {
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(contract.success.status);
  const parsed = contract.success.schema.safeParse(json);
  expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
  return json as z.output<C["success"]["schema"]>;
}

/** Asserts an error response in the standard shape. */
export async function expectError(res: Response, status: number, code: string): Promise<ErrorEnvelope> {
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(status);
  expect(errorEnvelopeSchema.safeParse(json).success).toBe(true);
  expect((json as ErrorEnvelope).code).toBe(code);
  return json as ErrorEnvelope;
}
