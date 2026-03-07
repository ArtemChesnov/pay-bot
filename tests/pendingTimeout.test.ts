import { describe, it, expect } from "vitest";

/**
 * Логика таймаута pending (соответствует cron):
 * a) proofSubmittedAt IS NULL -> timeout если createdAt < now - PENDING_TIMEOUT_HOURS
 * b) proofSubmittedAt NOT NULL -> timeout если proofSubmittedAt < now - REVIEW_TIMEOUT_DAYS
 */
function shouldTimeoutPending(
  createdAt: Date,
  proofSubmittedAt: Date | null,
  now: Date,
  pendingTimeoutHours: number,
  reviewTimeoutDays: number
): boolean {
  if (proofSubmittedAt === null) {
    const deadline = new Date(now.getTime() - pendingTimeoutHours * 60 * 60 * 1000);
    return createdAt < deadline;
  }
  const deadline = new Date(now.getTime() - reviewTimeoutDays * 24 * 60 * 60 * 1000);
  return proofSubmittedAt < deadline;
}

describe("pending timeout filters", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  const PENDING_H = 48;
  const REVIEW_D = 7;

  it("no proof: created 47h ago -> not timeout", () => {
    const createdAt = new Date(now.getTime() - 47 * 60 * 60 * 1000);
    expect(
      shouldTimeoutPending(createdAt, null, now, PENDING_H, REVIEW_D)
    ).toBe(false);
  });

  it("no proof: created 49h ago -> timeout", () => {
    const createdAt = new Date(now.getTime() - 49 * 60 * 60 * 1000);
    expect(
      shouldTimeoutPending(createdAt, null, now, PENDING_H, REVIEW_D)
    ).toBe(true);
  });

  it("with proof: submitted 6 days ago -> not timeout (review window)", () => {
    const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const proofSubmittedAt = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    expect(
      shouldTimeoutPending(createdAt, proofSubmittedAt, now, PENDING_H, REVIEW_D)
    ).toBe(false);
  });

  it("with proof: submitted 8 days ago -> timeout", () => {
    const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const proofSubmittedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    expect(
      shouldTimeoutPending(createdAt, proofSubmittedAt, now, PENDING_H, REVIEW_D)
    ).toBe(true);
  });
});
