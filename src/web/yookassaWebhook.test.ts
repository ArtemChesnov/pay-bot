import { describe, it, expect } from "vitest";
import { isAllowedIp } from "./yookassaWebhook.js";

describe("isAllowedIp", () => {
  it("allows any IP when allowlist is empty", () => {
    expect(isAllowedIp("192.168.1.1", "")).toBe(true);
    expect(isAllowedIp("1.2.3.4", "   ")).toBe(true);
  });

  it("allows IP that matches exactly", () => {
    expect(isAllowedIp("185.71.76.1", "185.71.76.1")).toBe(true);
    expect(isAllowedIp("185.71.76.1", "10.0.0.1,185.71.76.1")).toBe(true);
  });

  it("allows IP that starts with prefix (e.g. subnet)", () => {
    expect(isAllowedIp("185.71.76.99", "185.71.76")).toBe(true);
  });

  it("rejects IP not in allowlist", () => {
    expect(isAllowedIp("8.8.8.8", "185.71.76.1")).toBe(false);
    expect(isAllowedIp("185.71.77.1", "185.71.76.1")).toBe(false);
  });
});
