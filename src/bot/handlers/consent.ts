import type { BotContext } from "../middleware.js";
import { prisma } from "../../lib/prisma.js";
import { getEnv } from "../../lib/env.js";
import { requestContactKeyboard, startKeyboard, tariffKeyboard } from "../keyboards.js";
import { MSG_ASK_NAME, MSG_ASK_PHONE, MSG_PHONE_SAVED, MSG_START_DECLINED } from "../texts.js";

/**
 * Обработчик «Согласен(на) и продолжить»: сохраняет consent в БД, переходит к имени/телефону/тарифу.
 * @param {BotContext} ctx - Контекст Telegraf (callback_query)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleConsent(ctx: BotContext) {
  await ctx.answerCbQuery?.();
  const from = ctx.from;
  if (!from) return;

  const env = getEnv();
  const now = new Date();
  const telegramId = BigInt(from.id);
  const username = from.username ?? null;
  const firstName = from.first_name ?? null;

  const user = await prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username,
      firstName,
      consentAt: now,
      policyVersion: env.POLICY_VERSION,
      offerAcceptedAt: now,
      offerVersion: env.OFFER_VERSION,
    },
    update: {
      username,
      firstName,
      consentAt: now,
      policyVersion: env.POLICY_VERSION,
      offerAcceptedAt: now,
      offerVersion: env.OFFER_VERSION,
    },
  });

  ctx.user = {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    name: user.name,
    phone: user.phone,
    consentAt: user.consentAt,
  };

  if (!user.name) {
    return ctx.reply(MSG_ASK_NAME);
  }
  if (!user.phone) {
    return ctx.reply(MSG_ASK_PHONE, requestContactKeyboard());
  }
  return ctx.reply(MSG_PHONE_SAVED, tariffKeyboard());
}

/**
 * Обработчик «Пока не готов(а)»: показывает MSG_START_DECLINED и кнопку «Начать».
 * @param {BotContext} ctx - Контекст Telegraf (callback_query)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleConsentDecline(ctx: BotContext) {
  await ctx.answerCbQuery?.();
  return ctx.reply(MSG_START_DECLINED, startKeyboard());
}
