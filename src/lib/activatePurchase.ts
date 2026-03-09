/**
 * Shared logic: activate a pending purchase (set active, grant access, notify user and trainer).
 * Used by: YooKassa webhook (payment.succeeded), "Check payment" button, /force_activate.
 */

import { prisma } from "./prisma.js";
import { getEnv } from "./env.js";
import { logger } from "./logger.js";
import { isIgnorableTgError } from "./telegramErrors.js";
import { logAnalyticsEvent } from "./analytics.js";
import { getSelfGroupId, createInviteLink } from "../bot/services.js";
import {
  MSG_CONFIRMED_SELF_GROUP_READY,
  MSG_CONFIRMED_SELF_GROUP_NOT_READY,
  MSG_CONFIRMED_INDIVIDUAL_DM,
  MSG_CONFIRMED_INDIVIDUAL_DM_NO_USERNAME,
  MSG_INVITE_COOLDOWN,
  TRN_CONFIRMED,
  TRN_YOOKASSA_PAID,
  TRN_INDIVIDUAL_NEW_STUDENT,
  t,
} from "../bot/texts.js";
import type { Purchase, User, Tariff } from "@prisma/client";

type PurchaseWithRelations = Purchase & { user: User; tariff: Tariff };

type TelegramSender = {
  sendMessage: (chatId: number, text: string, extra?: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Приводит номер телефона к человекочитаемому виду для отображения в сообщениях.
 *
 * - Если номер похож на российский (11 цифр, начинается с 7 или 8), форматирует как `+7 901 688-86-59`.
 * - Если формат распознать нельзя, возвращает исходную строку.
 * - Хранение номера в БД не меняет, используется только для текста сообщений.
 *
 * @param {string | null | undefined} phone - Исходный номер телефона из БД
 * @returns {string} Отформатированный номер или исходное значение / «—»
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const rest = digits.slice(1);
    const part1 = rest.slice(0, 3);
    const part2 = rest.slice(3, 6);
    const part3 = rest.slice(6, 8);
    const part4 = rest.slice(8, 10);
    return `+7 ${part1} ${part2}-${part3}-${part4}`;
  }
  return phone;
}

/**
 * Активирует pending-заявку: переводит её в статус active, расчитывает срок доступа,
 * уведомляет пользователя и тренера и, при необходимости, отправляет/создаёт инвайт в чат.
 * Вызывается из webhook YooKassa, кнопки «Проверить оплату» и команды /force_activate.
 * @param {PurchaseWithRelations} purchase - Заявка с загруженными пользователем и тарифом
 * @param {TelegramSender} telegram - Отправитель сообщений (обычно bot.telegram)
 * @returns {Promise<void>}
 */
export async function activatePurchase(
  purchase: PurchaseWithRelations,
  telegram: TelegramSender
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + purchase.tariff.durationDays * 24 * 60 * 60 * 1000
  );
  const expiresAtStr = expiresAt.toLocaleDateString("ru-RU");
  const env = getEnv();

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      status: "active",
      accessExpiresAt: expiresAt,
      accessPending: purchase.tariff.type === "SELF",
      reviewedAt: null,
      reviewedBy: null,
      rejectReason: null,
      ...(purchase.ykPaymentId ? { ykStatus: "succeeded", ykPaidAt: now } : {}),
    },
  });

  const selfChatId = await getSelfGroupId();
  const userChatId = Number(purchase.user.telegramId);

  if (purchase.tariff.type === "SELF") {
    try {
      if (selfChatId) {
        const selfChatIdBig = BigInt(selfChatId);
        const cooldownMs = env.INVITE_COOLDOWN_MINUTES * 60 * 1000;
        const withinCooldown =
          purchase.inviteSentAt &&
          purchase.lastInviteChatId === selfChatIdBig &&
          now.getTime() - purchase.inviteSentAt.getTime() < cooldownMs;
        if (withinCooldown) {
          logger.debug({ purchaseId: purchase.id }, "SELF invite skipped (cooldown)");
          await telegram.sendMessage(
            userChatId,
            t(MSG_INVITE_COOLDOWN, { MINUTES: String(env.INVITE_COOLDOWN_MINUTES) })
          );
        } else {
          try {
            const link = await createInviteLink(selfChatId, env.TELEGRAM_BOT_TOKEN);
            const text = t(MSG_CONFIRMED_SELF_GROUP_READY, { EXPIRES_AT: expiresAtStr, INVITE_LINK: link });
            await telegram.sendMessage(userChatId, text, {
              reply_markup: {
                inline_keyboard: [[{ text: "Перейти в чат", url: link }]],
              },
            });
            await prisma.purchase.update({
              where: { id: purchase.id },
              data: {
                accessPending: false,
                inviteSentAt: now,
                lastInviteChatId: selfChatIdBig,
              },
            });
            logAnalyticsEvent("self_access_activated", {
              userId: String(purchase.userId),
              purchaseId: purchase.id,
              orderCode: purchase.orderCode,
              tariffType: purchase.tariff.type,
              source: "activate_purchase_self_with_chat",
            });
          } catch (e) {
            if (isIgnorableTgError(e)) {
              logger.debug({ err: e }, "Ignorable error creating invite");
            } else {
              logger.error({ err: e }, "Failed to create invite for SELF");
            }
            await telegram.sendMessage(
              userChatId,
              t(MSG_CONFIRMED_SELF_GROUP_NOT_READY, { EXPIRES_AT: expiresAtStr })
            );
          }
        }
      } else {
        await telegram.sendMessage(
          userChatId,
          t(MSG_CONFIRMED_SELF_GROUP_NOT_READY, { EXPIRES_AT: expiresAtStr })
        );
      }
    } catch (e) {
      logger.warn({ err: e, purchaseId: purchase.id }, "Failed to send SELF confirmation to user");
    }
  } else {
    // INDIVIDUAL: клиенту — подтверждение тарифа и тренера; тренеру — одно объединённое уведомление
    try {
      const trainerFromEnv = getEnv().TRAINER_USERNAME;
      const trainerUsername =
        trainerFromEnv && String(trainerFromEnv).trim() !== ""
          ? `@${String(trainerFromEnv).replace(/^@/, "")}`
          : null;
      if (trainerUsername) {
        await telegram.sendMessage(
          userChatId,
          t(MSG_CONFIRMED_INDIVIDUAL_DM, {
            EXPIRES_AT: expiresAtStr,
            TRAINER_USERNAME: trainerUsername,
          })
        );
      } else {
        await telegram.sendMessage(
          userChatId,
          t(MSG_CONFIRMED_INDIVIDUAL_DM_NO_USERNAME, { EXPIRES_AT: expiresAtStr })
        );
      }
      logAnalyticsEvent("individual_access_pending", {
        userId: String(purchase.userId),
        purchaseId: purchase.id,
        orderCode: purchase.orderCode,
        tariffType: purchase.tariff.type,
        source: "activate_purchase_individual",
      });
    } catch (e) {
      logger.warn({ err: e, purchaseId: purchase.id }, "Failed to send INDIVIDUAL confirmation to user");
    }

    const userLink = `tg://user?id=${purchase.user.telegramId}`;
    const usernameLink = purchase.user.username ? `https://t.me/${purchase.user.username}` : "—";
    const formattedPhone = formatPhoneForDisplay(purchase.user.phone);
    const priceRubles = purchase.amount ?? purchase.tariff.price ?? 0;
    const paymentLine =
      purchase.paymentProvider === "YOOKASSA"
        ? purchase.ykPaymentId
          ? `Оплата подтверждена через ЮKassa (ID: ${purchase.ykPaymentId}).`
          : "Оплата подтверждена через ЮKassa."
        : "Оплата подтверждена.";

    const trnCard = t(TRN_INDIVIDUAL_NEW_STUDENT, {
      PAYMENT_LINE: paymentLine,
      ORDER_CODE: purchase.orderCode,
      PRICE: String(priceRubles),
      EXPIRES_AT: expiresAtStr,
      NAME: purchase.user.name ?? "—",
      PHONE: formattedPhone,
      USERNAME: purchase.user.username ?? "—",
      TELEGRAM_ID: String(purchase.user.telegramId),
      USER_LINK: userLink,
      USERNAME_LINK: usernameLink,
    });
    await sendToTrainer(telegram, env.TRAINER_TELEGRAM_ID, trnCard, "TRN_INDIVIDUAL_NEW_STUDENT", purchase.id);
  }

  // Общие служебные уведомления тренеру: для SELF сохраняем существующий формат,
  // для INDIVIDUAL не создаём дополнительный шум (данные уже есть в карточке TRN_INDIVIDUAL_NEW_STUDENT).
  if (purchase.tariff.type === "SELF") {
    const formattedPhone = formatPhoneForDisplay(purchase.user.phone);
    const userLink = `tg://user?id=${purchase.user.telegramId}`;
    const usernameLink = purchase.user.username ? `https://t.me/${purchase.user.username}` : "—";
    const priceRubles = purchase.amount ?? purchase.tariff.price ?? 0;
    const paymentLine =
      purchase.paymentProvider === "YOOKASSA"
        ? purchase.ykPaymentId
          ? `Оплата подтверждена через ЮKassa (ID: ${purchase.ykPaymentId}).`
          : "Оплата подтверждена через ЮKassa."
        : "Оплата подтверждена.";

    const trainerText =
      `✅ Новый ученик по тарифу «${purchase.tariff.title}»\n\n` +
      `${paymentLine}\n` +
      `Заказ: ${purchase.orderCode}\n` +
      `Сумма: ${priceRubles} ₽\n` +
      `Доступ до: ${expiresAtStr}\n\n` +
      `Имя: ${purchase.user.name ?? "—"}\n` +
      `Телефон: ${formattedPhone}\n` +
      `Telegram: ${purchase.user.username ? `@${purchase.user.username}` : "—"} / id=${purchase.user.telegramId}\n\n` +
      `Ссылки:\n` +
      `${userLink}\n` +
      `${usernameLink}`;

    await sendToTrainer(telegram, env.TRAINER_TELEGRAM_ID, trainerText, "TRN_CONFIRMED_SELF", purchase.id);
  }
}

async function sendToTrainer(
  telegram: TelegramSender,
  trainerTelegramId: bigint,
  text: string,
  label: string,
  purchaseId: string
): Promise<void> {
  try {
    await telegram.sendMessage(Number(trainerTelegramId), text);
  } catch (e) {
    logger.warn(
      { err: e, trainerId: String(trainerTelegramId), label, purchaseId },
      "Failed to send message to trainer — проверьте TRAINER_TELEGRAM_ID и что тренер хотя бы раз написал боту /start"
    );
  }
}
