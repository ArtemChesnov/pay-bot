import { describe, it, expect } from "vitest";

/** Логика cooldown: не выдавать новый инвайт если lastInviteChatId === selfChatId и прошло < cooldownMs */
export function isWithinInviteCooldown(
  inviteSentAt: Date | null,
  lastInviteChatId: bigint | null,
  selfChatId: string,
  cooldownMs: number,
  now: Date
): boolean {
  if (!inviteSentAt || lastInviteChatId === null) return false;
  if (lastInviteChatId !== BigInt(selfChatId)) return false;
  return now.getTime() - inviteSentAt.getTime() < cooldownMs;
}

describe("isWithinInviteCooldown", () => {
  const cooldownMs = 15 * 60 * 1000;

  it("returns false when inviteSentAt is null", () => {
    expect(isWithinInviteCooldown(null, BigInt(-100), "-100", cooldownMs, new Date())).toBe(false);
  });

  it("returns false when lastInviteChatId !== selfChatId", () => {
    const sent = new Date(Date.now() - 60 * 1000);
    expect(isWithinInviteCooldown(sent, BigInt(-100), "-200", cooldownMs, new Date())).toBe(false);
  });

  it("returns true when same chat and within cooldown", () => {
    const now = new Date();
    const sent = new Date(now.getTime() - 5 * 60 * 1000);
    expect(isWithinInviteCooldown(sent, BigInt(-100), "-100", cooldownMs, now)).toBe(true);
  });

  it("returns false when same chat but past cooldown", () => {
    const now = new Date();
    const sent = new Date(now.getTime() - 20 * 60 * 1000);
    expect(isWithinInviteCooldown(sent, BigInt(-100), "-100", cooldownMs, now)).toBe(false);
  });
});
