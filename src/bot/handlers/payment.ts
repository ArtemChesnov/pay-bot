import type { BotContext } from "../middleware.js";
import { prisma } from "../../lib/prisma.js";
import {
  MSG_PROOF_REQUEST,
  MSG_PAYMENT_NOT_FOUND,
  MSG_YOOKASSA_USE_BUTTONS,
  MSG_MANUAL_DISABLED,
} from "../texts.js";

/**
 * Обработчик «Я оплатил(а)»: просит прислать подтверждение оплаты.
 * @param {BotContext} ctx - Контекст Telegraf (callback_query)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handlePaymentDone(ctx: BotContext) {
  await ctx.answerCbQuery?.();
  const user = ctx.user;
  if (!user) return;

  return ctx.reply(MSG_PROOF_REQUEST);
}

/**
 * Обработка фото/текста при pending-заявке: проверяет провайдер.
 * Для ЮKassa — направляет на кнопки «Оплатить»/«Проверить оплату».
 * @param {BotContext} ctx - Контекст Telegraf (message)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handlePaymentProof(ctx: BotContext) {
  const user = ctx.user;
  if (!user) return;

  const pending = await prisma.purchase.findFirst({
    where: { userId: user.id, status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { tariff: true },
  });
  if (!pending) {
    return ctx.reply(MSG_PAYMENT_NOT_FOUND);
  }
  if (pending.paymentProvider === "YOOKASSA") {
    return ctx.reply(MSG_YOOKASSA_USE_BUTTONS);
  }
  return ctx.reply(MSG_MANUAL_DISABLED);
}
