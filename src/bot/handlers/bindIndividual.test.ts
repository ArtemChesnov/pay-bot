import { describe, it, expect } from "vitest";

/** Парсинг orderCode из текста команды /bind_individual_chat (как в handler) */
function parseOrderCodeFromCommand(text: string): string | null {
  const orderCode = text.split(/\s+/)[1]?.trim();
  if (!orderCode || !orderCode.startsWith("ORDER-")) return null;
  return orderCode;
}

describe("bind_individual_chat orderCode parsing", () => {
  it("returns orderCode when valid ORDER- prefix", () => {
    expect(parseOrderCodeFromCommand("/bind_individual_chat ORDER-20250307-ABC12")).toBe("ORDER-20250307-ABC12");
    expect(parseOrderCodeFromCommand("/bind_individual_chat   ORDER-20250307-XYZZZ  ")).toBe("ORDER-20250307-XYZZZ");
  });

  it("returns null when missing or not ORDER-", () => {
    expect(parseOrderCodeFromCommand("/bind_individual_chat")).toBe(null);
    expect(parseOrderCodeFromCommand("/bind_individual_chat INVALID")).toBe(null);
  });
});
