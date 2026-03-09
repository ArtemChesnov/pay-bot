import type { BotContext } from "../middleware.js";
import { prisma } from "../../lib/prisma.js";
import { generateOrderCode, isYooKassaEnabled } from "../services.js";
import { existingPendingKeyboard, yookassaPayKeyboard, yookassaCheckOnlyKeyboard } from "../keyboards.js";
import {
  MSG_YOOKASSA_PAY,
  MSG_EXISTING_PENDING,
  MSG_OLD_PENDING_CREATE_NEW,
  MSG_TARIFF_UNAVAILABLE,
  MSG_REGISTER_FIRST,
  MSG_NEW_ORDER_CREATED,
  MSG_PAYMENT_CREATE_FAILED,
  MSG_PAYMENT_REPLACE_FAILED,
  MSG_PAYMENT_ORDER_NOT_FOUND,
  t,
} from "../texts.js";
import { logAnalyticsEvent } from "../../lib/analytics.js";
import { TariffType, PaymentProvider } from "@prisma/client";
import { getEnv } from "../../lib/env.js";
import { createPayment } from "../../lib/yookassa.js";
import { logger } from "../../lib/logger.js";
import { randomUUID } from "crypto";

/**
 * Обработчик выбора тарифа «Самостоятельный».
 * @param {BotContext} ctx - Контекст Telegraf (callback_query)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleTariffSelf(ctx: BotContext) {
  await handleTariff(ctx, TariffType.SELF);
}

/**
 * Обработчик выбора тарифа «Индивидуальный».
 * @param {BotContext} ctx - Контекст Telegraf (callback_query)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleTariffIndividual(ctx: BotContext) {
  await handleTariff(ctx, TariffType.INDIVIDUAL);
}

/**
 * Базовый URL приложения для формирования ссылок (policy, offer, yookassa return).
 * @param {ReturnType<typeof getEnv>} env - Конфигурация окружения
 * @returns {string} URL без завершающего слэша
 */
function getBaseUrl(env: ReturnType<typeof getEnv>): string {
  return (env.WEBHOOK_BASE_URL || `http://localhost:${env.PORT}`).replace(/\/$/, "");
}

/**
 * Создаёт или показывает pending-заявку по тарифу.
 * Требуются ключи ЮKassa; без них тариф недоступен.
 * @param {BotContext} ctx - Контекст Telegraf
 * @param {TariffType} type - Тип тарифа (SELF или INDIVIDUAL)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
/**
 * Создаёт или показывает pending-заявку по выбранному тарифу.
 * Логирует выбор тарифа и выдачу ссылки на оплату.
 * @param {BotContext} ctx - Контекст Telegraf
 * @param {TariffType} type - Тип тарифа (SELF или INDIVIDUAL)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
async function handleTariff(ctx: BotContext, type: TariffType) {
  await ctx.answerCbQuery?.();
  const user = ctx.user;
  if (!user) {
    return ctx.reply(MSG_REGISTER_FIRST, (await import("../keyboards.js")).startKeyboard());
  }

  const tariff = await prisma.tariff.findFirst({ where: { type, isActive: true } });
  if (!tariff) {
    return ctx.reply(MSG_TARIFF_UNAVAILABLE);
  }

  logAnalyticsEvent("tariff_selected", {
    userId: String(user.id),
    tariffType: type,
    source: "tariff_inline",
  });

  const env = getEnv();
  const useYooKassa = isYooKassaEnabled();
  const baseUrl = getBaseUrl(env);

  const existingPending = await prisma.purchase.findFirst({
    where: { userId: user.id, tariffId: tariff.id, status: "pending" },
    orderBy: { createdAt: "desc" },
  });

  if (existingPending) {
    const mainText = t(MSG_YOOKASSA_PAY, {
      TARIFF_TITLE: tariff.title,
      PRICE: tariff.price,
      ORDER_CODE: existingPending.orderCode,
    });
    const text = `${mainText}\n\n${MSG_EXISTING_PENDING}`;
    if (existingPending.paymentProvider === "YOOKASSA" && existingPending.ykConfirmationUrl) {
      logAnalyticsEvent("payment_link_sent", {
        userId: String(user.id),
        purchaseId: existingPending.id,
        orderCode: existingPending.orderCode,
        tariffType: tariff.type,
        source: "existing_pending",
      });
      const keyboard = yookassaPayKeyboard(existingPending.ykConfirmationUrl, existingPending.id);
      return ctx.reply(text, keyboard);
    }
    if (existingPending.paymentProvider === "YOOKASSA") {
      return ctx.reply(text, yookassaCheckOnlyKeyboard(existingPending.id));
    }
    return ctx.reply(MSG_OLD_PENDING_CREATE_NEW, existingPendingKeyboard(existingPending.id));
  }

  if (!useYooKassa) {
    return ctx.reply(MSG_TARIFF_UNAVAILABLE);
  }

  const orderCode = await generateOrderCode();
  const idempotenceKey = randomUUID();
  const returnUrl = env.YOOKASSA_RETURN_URL || `${baseUrl}/yookassa/return`;
  const purchase = await prisma.purchase.create({
    data: {
      userId: user.id,
      tariffId: tariff.id,
      orderCode,
      status: "pending",
      amount: tariff.price,
      currency: "RUB",
      paymentProvider: PaymentProvider.YOOKASSA,
      ykIdempotenceKey: idempotenceKey,
    },
  });

  try {
    const result = await createPayment(env.YOOKASSA_SHOP_ID!, env.YOOKASSA_SECRET_KEY!, {
      amount: tariff.price,
      currency: "RUB",
      orderCode,
      tariffTitle: tariff.title,
      userTelegramId: String(user.telegramId),
      tariffType: type,
      returnUrl,
      idempotenceKey,
    });

    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        ykPaymentId: result.id,
        ykStatus: result.status,
        ykConfirmationUrl: result.confirmationUrl,
      },
    });

    const text = t(MSG_YOOKASSA_PAY, {
      TARIFF_TITLE: tariff.title,
      PRICE: tariff.price,
      ORDER_CODE: orderCode,
    });
    const keyboard = result.confirmationUrl
      ? yookassaPayKeyboard(result.confirmationUrl, purchase.id)
      : yookassaCheckOnlyKeyboard(purchase.id);

    if (result.confirmationUrl) {
      logAnalyticsEvent("payment_link_sent", {
        userId: String(user.id),
        purchaseId: purchase.id,
        orderCode,
        tariffType: tariff.type,
        source: "new_purchase",
      });
    }
    return ctx.reply(text, keyboard);
  } catch (e) {
    logger.error({ err: e, orderCode }, "YooKassa createPayment failed");
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: "rejected",
        rejectReason: "yookassa_create_failed",
        reviewedAt: new Date(),
        reviewedBy: BigInt(0),
      },
    });
    return ctx.reply(MSG_PAYMENT_CREATE_FAILED);
  }
}

/**
 * «Создать новую заявку»: помечает старую pending как rejected (replaced), создаёт новую.
 * Без ключей ЮKassa — демо-заявка аналогично handleTariff.
 * @param {BotContext} ctx - Контекст Telegraf (callback_query replace_pending_&lt;id&gt;)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleReplacePending(ctx: BotContext) {
  await ctx.answerCbQuery?.();
  const user = ctx.user;
  if (!user) return ctx.reply(MSG_REGISTER_FIRST, (await import("../keyboards.js")).startKeyboard());

  const cb = ctx.callbackQuery;
  if (!cb || !("data" in cb) || typeof cb.data !== "string") return;
  const data = cb.data as string;
  const prefix = "replace_pending_";
  if (!data.startsWith(prefix)) return;
  const purchaseId = data.slice(prefix.length);

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { user: true, tariff: true },
  });
  if (!purchase || purchase.userId !== user.id || purchase.status !== "pending") {
    return ctx.reply(MSG_PAYMENT_ORDER_NOT_FOUND);
  }

  const now = new Date();
  const systemReviewer = BigInt(0);
  await prisma.purchase.update({
    where: { id: purchaseId },
    data: { status: "rejected", rejectReason: "replaced", reviewedAt: now, reviewedBy: systemReviewer },
  });

  const tariff = purchase.tariff;
  const orderCode = await generateOrderCode();
  const envReplace = getEnv();
  const baseUrlReplace = getBaseUrl(envReplace);

  if (!isYooKassaEnabled()) {
    return ctx.reply(MSG_TARIFF_UNAVAILABLE);
  }

  const returnUrl = envReplace.YOOKASSA_RETURN_URL || `${baseUrlReplace}/yookassa/return`;
  const idempotenceKey = randomUUID();
  const newPurchase = await prisma.purchase.create({
    data: {
      userId: user.id,
      tariffId: tariff.id,
      orderCode,
      status: "pending",
      amount: tariff.price,
      currency: "RUB",
      paymentProvider: PaymentProvider.YOOKASSA,
      ykIdempotenceKey: idempotenceKey,
    },
  });
  try {
    const result = await createPayment(envReplace.YOOKASSA_SHOP_ID!, envReplace.YOOKASSA_SECRET_KEY!, {
      amount: tariff.price,
      currency: "RUB",
      orderCode,
      tariffTitle: tariff.title,
      userTelegramId: String(user.telegramId),
      tariffType: tariff.type,
      returnUrl,
      idempotenceKey,
    });
    await prisma.purchase.update({
      where: { id: newPurchase.id },
      data: {
        ykPaymentId: result.id,
        ykStatus: result.status,
        ykConfirmationUrl: result.confirmationUrl,
      },
    });
    const text = t(MSG_YOOKASSA_PAY, {
      TARIFF_TITLE: tariff.title,
      PRICE: tariff.price,
      ORDER_CODE: orderCode,
    });
    const keyboard = result.confirmationUrl
      ? yookassaPayKeyboard(result.confirmationUrl, newPurchase.id)
      : yookassaCheckOnlyKeyboard(newPurchase.id);
    return ctx.reply(`${MSG_NEW_ORDER_CREATED}\n\n${text}`, keyboard);
  } catch (e) {
    logger.error({ err: e, orderCode }, "YooKassa createPayment failed on replace");
    await prisma.purchase.update({
      where: { id: newPurchase.id },
      data: {
        status: "rejected",
        rejectReason: "yookassa_create_failed",
        reviewedAt: new Date(),
        reviewedBy: systemReviewer,
      },
    });
    return ctx.reply(MSG_PAYMENT_REPLACE_FAILED);
  }
}
