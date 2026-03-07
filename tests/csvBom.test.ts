import { describe, it, expect } from "vitest";

const UTF8_BOM = "\uFEFF";
const BOM_BYTES = [0xef, 0xbb, 0xbf];

describe("CSV UTF-8 BOM", () => {
  it("BOM string is U+FEFF", () => {
    expect(UTF8_BOM).toBe("\uFEFF");
    expect(UTF8_BOM.charCodeAt(0)).toBe(0xfeff);
  });

  it("Buffer from BOM + content starts with EF BB BF", () => {
    const content = "id;name\n1;test";
    const buf = Buffer.from(UTF8_BOM + content, "utf-8");
    expect(buf.length).toBeGreaterThan(3);
    expect(buf[0]).toBe(BOM_BYTES[0]);
    expect(buf[1]).toBe(BOM_BYTES[1]);
    expect(buf[2]).toBe(BOM_BYTES[2]);
  });

  it("Excel recognizes BOM for UTF-8", () => {
    const withBom = UTF8_BOM + "id;name\n1;Кириллица";
    const buf = Buffer.from(withBom, "utf-8");
    expect(buf[0]).toBe(0xef);
    const decoded = buf.toString("utf-8");
    expect(decoded.charCodeAt(0)).toBe(0xfeff);
    expect(decoded.slice(1).startsWith("id")).toBe(true);
    expect(decoded.includes("Кириллица")).toBe(true);
  });
});
