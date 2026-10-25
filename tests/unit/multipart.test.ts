import { describe, expect, it } from "vitest";
import { parseMultipart, requireFile } from "@/lib/http/multipart";
import { ApiError } from "@/lib/http/errors";

function form(parts: string, boundary = "----test"): { bytes: Uint8Array; contentType: string } {
  return {
    bytes: new TextEncoder().encode(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("parseMultipart", () => {
  it("reads fields and a binary file without corrupting bytes", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
    const boundary = "----test";
    const head =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="photoConsent"\r\n\r\n` +
      `true\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="photo"; filename="me.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const bytes = new Uint8Array(head.length + png.length + tail.length);
    bytes.set(new TextEncoder().encode(head), 0);
    bytes.set(png, head.length);
    bytes.set(new TextEncoder().encode(tail), head.length + png.length);

    const parsed = parseMultipart(bytes, `multipart/form-data; boundary=${boundary}`);
    expect(parsed.fields.photoConsent).toBe("true");
    expect(parsed.files.photo?.filename).toBe("me.png");
    expect(parsed.files.photo?.contentType).toBe("image/png");
    expect(parsed.files.photo?.bytes).toEqual(png);
  });

  it("rejects a missing boundary and a missing file field", () => {
    expect(() => parseMultipart(new Uint8Array(), "multipart/form-data")).toThrow(ApiError);
    const { bytes, contentType } = form(
      `------test\r\nContent-Disposition: form-data; name="x"\r\n\r\nhi\r\n------test--`,
    );
    const parsed = parseMultipart(bytes, contentType);
    expect(() => requireFile(parsed, "photo")).toThrow(ApiError);
  });
});
