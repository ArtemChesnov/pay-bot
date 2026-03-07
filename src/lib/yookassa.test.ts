import { describe, it, expect } from "vitest";
import { buildCreatePaymentBody } from "./yookassa.js";

describe("buildCreatePaymentBody", () => {
  it("builds payload with amount.value string, capture true, metadata.orderCode", () => {
    const body = buildCreatePaymentBody({
      amount: 1000,
      orderCode: "ORDER-20250306-ABC12",
      tariffTitle: "Самостоятельный",
      userTelegramId: "123456",
      tariffType: "SELF",
      returnUrl: "https://example.com/return",
      idempotenceKey: "uuid-here",
    });
    expect(body.amount).toEqual({ value: "1000.00", currency: "RUB" });
    expect(body.capture).toBe(true);
    expect(body.confirmation).toEqual({ type: "redirect", return_url: "https://example.com/return" });
    expect((body.metadata as { orderCode: string }).orderCode).toBe("ORDER-20250306-ABC12");
  });

  it("throws when amount <= 0", () => {
    expect(() =>
      buildCreatePaymentBody({
        amount: 0,
        orderCode: "O",
        tariffTitle: "T",
        userTelegramId: "1",
        tariffType: "SELF",
        returnUrl: "https://x",
        idempotenceKey: "k",
      })
    ).toThrow("YooKassa amount must be positive");
  });
});
