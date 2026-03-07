/**
 * Строгие инварианты для Purchase.
 * status=active => accessExpiresAt NOT NULL
 * status=rejected => reviewedAt, reviewedBy, rejectReason NOT NULL
 * status=expired => accessExpiresAt NOT NULL
 * status=pending => reviewedAt, reviewedBy MUST be NULL
 */

import type { Purchase, PurchaseStatus } from "@prisma/client";

export function assertPurchaseInvariants(p: Purchase): void {
  switch (p.status) {
    case "active":
      if (p.accessExpiresAt == null) {
        throw new InvariantError("Purchase active must have accessExpiresAt");
      }
      break;
    case "rejected":
      if (p.reviewedAt == null || p.reviewedBy == null || p.rejectReason == null || p.rejectReason === "") {
        throw new InvariantError("Purchase rejected must have reviewedAt, reviewedBy, rejectReason");
      }
      break;
    case "expired":
      if (p.accessExpiresAt == null) {
        throw new InvariantError("Purchase expired must have accessExpiresAt");
      }
      break;
    case "pending":
      if (p.reviewedAt != null || p.reviewedBy != null) {
        throw new InvariantError("Purchase pending must have reviewedAt and reviewedBy null");
      }
      break;
    default:
      break;
  }
}

export function assertTransitionAllowed(
  fromStatus: PurchaseStatus,
  toStatus: PurchaseStatus,
  data: Partial<Purchase>
): void {
  if (toStatus === "active") {
    if (data.accessExpiresAt == null) throw new InvariantError("Transition to active requires accessExpiresAt");
  }
  if (toStatus === "rejected") {
    if (data.reviewedAt == null || data.reviewedBy == null || data.rejectReason == null) {
      throw new InvariantError("Transition to rejected requires reviewedAt, reviewedBy, rejectReason");
    }
  }
  if (toStatus === "expired") {
    if (data.accessExpiresAt == null) throw new InvariantError("Transition to expired requires accessExpiresAt");
  }
  if (toStatus === "pending") {
    if (data.reviewedAt != null || data.reviewedBy != null) {
      throw new InvariantError("Transition to pending requires reviewedAt and reviewedBy null");
    }
  }
}

export class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvariantError";
  }
}
