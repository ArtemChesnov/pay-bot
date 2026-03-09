import { prisma } from "../lib/prisma.js";
import { getEnv } from "../lib/env.js";
import type { TariffType } from "@prisma/client";

const ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  return s;
}

/** Уникальный код заказа на каждую попытку оплаты (не из ENV). Формат ORDER-YYYYMMDD-XXXXX */
export async function generateOrderCode(): Promise<string> {
  const date = new Date();
  const yyyymmdd =
    date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0");
  let code: string;
  let exists = true;
  let attempts = 0;
  while (exists && attempts < 10) {
    code = `ORDER-${yyyymmdd}-${randomCode(5)}`;
    const found = await prisma.purchase.findUnique({ where: { orderCode: code } });
    exists = !!found;
    attempts++;
    if (!exists) return code!;
  }
  return `ORDER-${yyyymmdd}-${randomCode(5)}-${Date.now().toString(36)}`;
}

export function getPaymentDetails(): { card?: string; sbp?: string } {
  const env = getEnv();
  return { card: env.CARD_NUMBER, sbp: env.SBP_PHONE };
}

/** Приоритет: 1) configSelf, 2) configLegacy, 3) envFallback. Для тестов и единого места логики. */
export function getSelfGroupIdPrecedence(
  configSelf: string | null,
  configLegacy: string | null,
  envFallback: string | null | undefined
): string | null {
  if (configSelf) return configSelf;
  if (configLegacy) return configLegacy;
  return envFallback ?? null;
}

/** Приоритет 1: SystemConfig "SELF_GROUP_ID", 2: "self_group_chat_id" (legacy), 3: env.SELF_GROUP_ID */
export async function getSelfGroupId(): Promise<string | null> {
  const row1 = await prisma.systemConfig.findUnique({ where: { key: "SELF_GROUP_ID" } });
  const row2 = await prisma.systemConfig.findUnique({ where: { key: "self_group_chat_id" } });
  const env = getEnv();
  return getSelfGroupIdPrecedence(row1?.value ?? null, row2?.value ?? null, env.SELF_GROUP_ID);
}

/** @deprecated Use getSelfGroupId */
export async function getSelfGroupChatId(): Promise<string | null> {
  return getSelfGroupId();
}

export async function setSelfGroupChatId(chatId: string): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key: "SELF_GROUP_ID" },
    create: { key: "SELF_GROUP_ID", value: chatId },
    update: { value: chatId },
  });
  await prisma.systemConfig.upsert({
    where: { key: "self_group_chat_id" },
    create: { key: "self_group_chat_id", value: chatId },
    update: { value: chatId },
  });
}

/** member_limit=1, expire_date=now+expireMinutes (default 60) */
export async function createInviteLink(chatId: string, botToken: string, expireMinutes = 60): Promise<string> {
  const expire = Math.floor(Date.now() / 1000) + expireMinutes * 60;
  const url = `https://api.telegram.org/bot${botToken}/createChatInviteLink?chat_id=${chatId}&member_limit=1&expire_date=${expire}`;
  const res = await fetch(url);
  const data = (await res.json()) as { ok: boolean; result?: { invite_link: string } };
  if (!data.ok || !data.result?.invite_link) {
    throw new Error("Failed to create invite link: " + JSON.stringify(data));
  }
  return data.result.invite_link;
}

export function isTrainer(telegramId: bigint): boolean {
  return getEnv().TRAINER_TELEGRAM_ID === telegramId;
}

export function isYooKassaEnabled(): boolean {
  const env = getEnv();
  return !!(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
}
