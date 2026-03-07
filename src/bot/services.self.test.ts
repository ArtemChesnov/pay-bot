import { describe, it, expect } from "vitest";
import { getSelfGroupIdPrecedence } from "./services.js";

describe("getSelfGroupIdPrecedence", () => {
  it("returns configSelf when set (SystemConfig wins)", () => {
    expect(getSelfGroupIdPrecedence("-100123", "-100456", "-100789")).toBe("-100123");
    expect(getSelfGroupIdPrecedence("123", null, "456")).toBe("123");
  });

  it("returns configLegacy when configSelf empty and legacy set (fallback)", () => {
    expect(getSelfGroupIdPrecedence(null, "-100456", "-100789")).toBe("-100456");
    expect(getSelfGroupIdPrecedence("", "999", undefined)).toBe("999");
  });

  it("returns envFallback when both configs empty", () => {
    expect(getSelfGroupIdPrecedence(null, null, "-100789")).toBe("-100789");
    expect(getSelfGroupIdPrecedence(null, null, "42")).toBe("42");
  });

  it("returns null when all empty", () => {
    expect(getSelfGroupIdPrecedence(null, null, null)).toBe(null);
    expect(getSelfGroupIdPrecedence(null, null, undefined)).toBe(null);
  });
});
