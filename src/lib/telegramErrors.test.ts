import { describe, it, expect } from "vitest";
import { isIgnorableTgError, normalizeTgErrorMessage } from "./telegramErrors.js";

describe("isIgnorableTgError", () => {
  it("returns true for user not found", () => {
    expect(isIgnorableTgError({ description: "Bad Request: user not found" })).toBe(true);
  });

  it("returns true for USER_NOT_PARTICIPANT", () => {
    expect(isIgnorableTgError({ description: "USER_NOT_PARTICIPANT" })).toBe(true);
  });

  it("returns true for blocked by user", () => {
    expect(isIgnorableTgError({ description: "Forbidden: bot was blocked by the user" })).toBe(true);
  });

  it("returns false for generic error", () => {
    expect(isIgnorableTgError({ description: "Internal server error" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isIgnorableTgError(null)).toBe(false);
  });
});

describe("normalizeTgErrorMessage", () => {
  it("extracts description from object", () => {
    expect(normalizeTgErrorMessage({ description: "user not found" })).toBe("user not found");
  });

  it("uses Error message", () => {
    expect(normalizeTgErrorMessage(new Error("fail"))).toBe("fail");
  });

  it("returns empty for null", () => {
    expect(normalizeTgErrorMessage(null)).toBe("");
  });
});
