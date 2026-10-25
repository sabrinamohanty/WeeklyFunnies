import { describe, expect, it } from "vitest";
import { processUpload } from "@/lib/images/process";
import { ApiError } from "@/lib/http/errors";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("processUpload", () => {
  it("re-encodes a PNG and reports its size", async () => {
    const out = await processUpload(PNG);
    expect(out.mimeType).toBe("image/png");
    expect(out.ext).toBe("png");
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(out.bytes[0]).toBe(0x89);
    expect(out.bytes[1]).toBe(0x50);
  });

  it("rejects SVG and empty bytes", async () => {
    await expect(processUpload(new TextEncoder().encode("<svg></svg>"))).rejects.toBeInstanceOf(ApiError);
    await expect(processUpload(new Uint8Array())).rejects.toBeInstanceOf(ApiError);
  });
});
