/**
 * «Проверить оплату» — запрос статуса в ЮKassa, синхронизация БД, при succeeded — активация заявки.
 */

import type { BotContext } from "../middleware.js";
import { prisma } from "../../lib/prisma.js";
import { getEnv } from "../../lib/env.js";
import { getPayment } from "../../lib/yookassa.js";
import { activatePurchase } from "../../lib/activatePurchase.js";
import { getSelfGroupId, createInviteLink } from "../services.js";
import {
  MSG_PAYMENT_CHECK_PENDING,
  MSG_PAYMENT_CHECK_CANCELED,
  MSG_PAYMENT_CHECK_SUCCESS,
  MSG_PAYMENT_CHECK_UNAVAILABLE,
  MSG_PAYMENT_AMOUNT_MISMATCH,
  MSG_PAYMENT_ORDER_NOT_FOUND,
  MSG_PAYMENT_ALREADY_ACTIVE,
  MSG_CONFIRMED_SELF_GROUP_READY,
  MSG_PAYMENT_NOT_FOUND,
} from "../texts.js";
import { t } from "../texts.js";
import { logger } from "../../lib/logger.js";
import { logAnalyticsEvent } from "../../lib/analytics.js";

const CHECK_PAYMENT_PREFIX = "check_payment_";

/**
 * «Проверить оплату»: getPayment в ЮKassa, при succeeded — activatePurchase и MSG_PAYMENT_CHECK_SUCCESS.
 * Гарантирует, что в каждом состоянии пользователь получает статус и следующий шаг.
 * Логирует ключевые продуктовые события проверки платежа.
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

  logAnalyticsEvent("payment_check_clicked", {
    userId: String(user.id),
    purchaseId,
    source: "check_payment_button",
  });

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { user: true, tariff: true },
  });

  if (!purchase) {
    logAnalyticsEvent("payment_not_found_shown", {
      userId: String(user.id),
      purchaseId,
      source: "check_payment",
    });
    return ctx.reply(MSG_PAYMENT_NOT_FOUND);
  }
  if (purchase.userId !== user.id) {
    return ctx.reply(MSG_PAYMENT_ORDER_NOT_FOUND);
  }
  if (purchase.status === "active") {
    const expiresAtStr = purchase.accessExpiresAt
      ? purchase.accessExpiresAt.toLocaleDateString("ru-RU")
      : "";
    if (purchase.tariff.type === "SELF") {
      const selfChatId = await getSelfGroupId();
      if (selfChatId) {
        try {
          const env = getEnv();
          const link = await createInviteLink(selfChatId, env.TELEGRAM_BOT_TOKEN);
          const text = t(MSG_CONFIRMED_SELF_GROUP_READY, { EXPIRES_AT: expiresAtStr, INVITE_LINK: link });
          await ctx.reply(text, {
            reply_markup: {
              inline_keyboard: [[{ text: "Перейти в чат", url: link }]],
            },
          });
          logAnalyticsEvent("self_access_activated", {
            userId: String(user.id),
            purchaseId: purchase.id,
            orderCode: purchase.orderCode,
            tariffType: purchase.tariff.type,
            source: "check_payment_already_active_with_chat",
          });
          return;
        } catch {
          // чат не настроен или ошибка API — отправляем общее сообщение
        }
      }
    }
    logAnalyticsEvent("payment_already_active", {
      userId: String(user.id),
      purchaseId: purchase.id,
      orderCode: purchase.orderCode,
      tariffType: purchase.tariff.type,
      source: "check_payment_already_active",
    });
    return ctx.reply(MSG_PAYMENT_ALREADY_ACTIVE);
  }
  if (purchase.status !== "pending") {
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
      logAnalyticsEvent("payment_check_pending", {
        userId: String(user.id),
        purchaseId: purchase.id,
        orderCode: purchase.orderCode,
        tariffType: purchase.tariff.type,
        source: "check_payment",
      });
      return ctx.reply(MSG_PAYMENT_CHECK_PENDING);
    }
    if (payment.status === "canceled") {
      await prisma.purchase.update({
        where: { id: purchaseId },
        data: { ykStatus: "canceled" },
      });
      logAnalyticsEvent("payment_check_canceled", {
        userId: String(user.id),
        purchaseId: purchase.id,
        orderCode: purchase.orderCode,
        tariffType: purchase.tariff.type,
        source: "check_payment",
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
      // Все пользовательские уведомления об активации и доступе
      // отправляются внутри activatePurchase в зависимости от тарифа.
      await activatePurchase(updated, ctx.telegram);
      logAnalyticsEvent("payment_confirmed", {
        userId: String(updated.userId),
        purchaseId: updated.id,
        orderCode: updated.orderCode,
        tariffType: updated.tariff.type,
        source: "check_payment_succeeded",
      });
      return;
    }
  } catch (err) {
    logger.warn({ err, purchaseId }, "Check payment: getPayment failed");
    return ctx.reply(MSG_PAYMENT_CHECK_UNAVAILABLE);
  }
}
