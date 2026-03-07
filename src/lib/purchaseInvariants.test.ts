import { describe, it, expect } from "vitest";
import {
  assertPurchaseInvariants,
  assertTransitionAllowed,
  InvariantError,
} from "./purchaseInvariants.js";
import type { Purchase } from "@prisma/client";

const basePurchase: Purchase = {
  id: "id",
  userId: "u",
  tariffId: "t",
  orderCode: "ORDER-1",
  paymentProvider: "MANUAL",
  amount: 100,
  currency: "RUB",
  paymentMethod: null,
  status: "pending",
  accessPending: false,
  accessExpiresAt: null,
  reviewedAt: null,
  reviewedBy: null,
  rejectReason: null,
  proofType: null,
  proofText: null,
  proofFileId: null,
  proofSubmittedAt: null,
  ykPaymentId: null,
  ykStatus: null,
  ykConfirmationUrl: null,
  ykIdempotenceKey: null,
  ykPaidAt: null,
  inviteSentAt: null,
  lastInviteChatId: null,
  individualChatId: null,
  individualInviteSentAt: null,
  individualLastInviteChatId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("assertPurchaseInvariants", () => {
  it("accepts pending with reviewedAt/reviewedBy null", () => {
    expect(() => assertPurchaseInvariants({ ...basePurchase, status: "pending" })).not.toThrow();
  });

  it("throws for pending with reviewedAt set", () => {
    expect(() =>
      assertPurchaseInvariants({
        ...basePurchase,
        status: "pending",
        reviewedAt: new Date(),
      })
    ).toThrow(InvariantError);
  });

  it("accepts active with accessExpiresAt set", () => {
    const exp = new Date();
    expect(() =>
      assertPurchaseInvariants({
        ...basePurchase,
        status: "active",
        accessExpiresAt: exp,
      })
    ).not.toThrow();
  });

  it("throws for active without accessExpiresAt", () => {
    expect(() =>
      assertPurchaseInvariants({
        ...basePurchase,
        status: "active",
        accessExpiresAt: null,
      })
    ).toThrow(InvariantError);
  });

  it("accepts rejected with reviewedAt, reviewedBy, rejectReason", () => {
    expect(() =>
      assertPurchaseInvariants({
        ...basePurchase,
        status: "rejected",
        reviewedAt: new Date(),
        reviewedBy: BigInt(1),
        rejectReason: "manual_reject",
      })
    ).not.toThrow();
  });

  it("throws for rejected without rejectReason", () => {
    expect(() =>
      assertPurchaseInvariants({
        ...basePurchase,
        status: "rejected",
        reviewedAt: new Date(),
        reviewedBy: BigInt(1),
        rejectReason: null,
      })
    ).toThrow(InvariantError);
  });

  it("accepts expired with accessExpiresAt", () => {
    expect(() =>
      assertPurchaseInvariants({
        ...basePurchase,
        status: "expired",
        accessExpiresAt: new Date(),
      })
    ).not.toThrow();
  });
});

describe("assertTransitionAllowed", () => {
  it("allows pending -> active with accessExpiresAt", () => {
    const exp = new Date();
    expect(() =>
      assertTransitionAllowed("pending", "active", { accessExpiresAt: exp })
    ).not.toThrow();
  });

  it("throws pending -> active without accessExpiresAt", () => {
    expect(() =>
      assertTransitionAllowed("pending", "active", {})
    ).toThrow(InvariantError);
  });

  it("allows pending -> rejected with reviewedAt, reviewedBy, rejectReason", () => {
    const now = new Date();
    expect(() =>
      assertTransitionAllowed("pending", "rejected", {
        reviewedAt: now,
        reviewedBy: BigInt(1),
        rejectReason: "manual_reject",
      })
    ).not.toThrow();
  });

  it("throws pending -> rejected without rejectReason", () => {
    expect(() =>
      assertTransitionAllowed("pending", "rejected", {
        reviewedAt: new Date(),
        reviewedBy: BigInt(1),
      })
    ).toThrow(InvariantError);
  });
});
