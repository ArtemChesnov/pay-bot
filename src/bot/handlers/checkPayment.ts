/**
 * «Проверить оплату» — запрос статуса в ЮKassa, синхронизация БД, при succeeded — активация заявки.
 */

import type { BotContext } from "../middleware.js";
import { prisma } from "../../lib/prisma.js";
import { getEnv } from "../../lib/env.js";
import { getPayment } from "../../lib/yookassa.js";
import { activatePurchase } from "../../lib/activatePurchase.js";
import {
  MSG_PAYMENT_CHECK_PENDING,
  MSG_PAYMENT_CHECK_CANCELED,
  MSG_PAYMENT_CHECK_SUCCESS,
  MSG_PAYMENT_CHECK_UNAVAILABLE,
  MSG_PAYMENT_AMOUNT_MISMATCH,
  MSG_PAYMENT_ORDER_NOT_FOUND,
} from "../texts.js";

const CHECK_PAYMENT_PREFIX = "check_payment_";

/**
 * «Проверить оплату»: getPayment в ЮKassa, при succeeded — activatePurchase и MSG_PAYMENT_CHECK_SUCCESS.
 * @param {BotContext} ctx - Контекст Telegraf (callback_query check_payment_&lt;id&gt;)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleCheckPayment(ctx: BotContext) {
  await ctx.answerCbQuery?.();
  const user = ctx.user;
  if (!user) return;

  const cb = ctx.callbackQuery;
  if (!cb || !("data" in cb) || typeof cb.data !== "string" || !cb.data.startsWith(CHECK_PAYMENT_PREFIX)) return;

  const purchaseId = cb.data.slice(CHECK_PAYMENT_PREFIX.length);

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { user: true, tariff: true },
  });

  if (!purchase || purchase.userId !== user.id || purchase.status !== "pending") {
    return ctx.reply(MSG_PAYMENT_ORDER_NOT_FOUND);
  }

  if (!purchase.ykPaymentId || purchase.ykPaymentId.startsWith("demo_") || purchase.ykPaymentId.startsWith("test_")) {
    return ctx.reply(MSG_PAYMENT_ORDER_NOT_FOUND);
  }

  const env = getEnv();
  if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY) {
    return ctx.reply(MSG_PAYMENT_CHECK_UNAVAILABLE);
  }

  try {
    const payment = await getPayment(env.YOOKASSA_SHOP_ID, env.YOOKASSA_SECRET_KEY, purchase.ykPaymentId);
    if (payment.status === "pending") {
      return ctx.reply(MSG_PAYMENT_CHECK_PENDING);
    }
    if (payment.status === "canceled") {
      await prisma.purchase.update({
        where: { id: purchaseId },
        data: { ykStatus: "canceled" },
      });
      return ctx.reply(MSG_PAYMENT_CHECK_CANCELED);
    }
    if (payment.status !== "succeeded") {
      return ctx.reply(MSG_PAYMENT_CHECK_PENDING);
    }

    const paymentRubles = parseFloat(payment.amount?.value ?? "0");
    const purchaseRubles = purchase.amount ?? 0;
    if (purchaseRubles > 0 && Math.abs(paymentRubles - purchaseRubles) >= 0.01) {
      return ctx.reply(MSG_PAYMENT_AMOUNT_MISMATCH);
    }

    await prisma.purchase.update({
      where: { id: purchaseId },
      data: { ykStatus: "succeeded", ykPaidAt: new Date() },
    });

    const updated = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { user: true, tariff: true },
    });
    if (updated) {
      await activatePurchase(updated, ctx.telegram);
      return ctx.reply(MSG_PAYMENT_CHECK_SUCCESS);
    }
  } catch {
    return ctx.reply(MSG_PAYMENT_CHECK_UNAVAILABLE);
  }
}
