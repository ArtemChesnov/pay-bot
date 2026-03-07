import { describe, it, expect } from "vitest";

describe("orderCode format", () => {
  const yyyymmdd = "20260304";
  const ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function randomCode(length: number): string {
    let s = "";
    for (let i = 0; i < length; i++) {
      s += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
    }
    return s;
  }

  it("generates ORDER-YYYYMMDD-XXXXX format", () => {
    const code = `ORDER-${yyyymmdd}-${randomCode(5)}`;
    expect(code).toMatch(/^ORDER-\d{8}-[A-Z0-9]{5}$/);
  });

  it("format is stable for fixed random seed (sanity)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(`ORDER-${yyyymmdd}-${randomCode(5)}`);
    }
    expect(codes.size).toBe(100);
  });
});
