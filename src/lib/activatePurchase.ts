/**
 * Shared logic: activate a pending purchase (set active, grant access, notify user and trainer).
 * Used by: YooKassa webhook (payment.succeeded), "Check payment" button, /force_activate.
 */

import { prisma } from "./prisma.js";
import { getEnv } from "./env.js";
import { getSelfGroupId, createInviteLink } from "../bot/services.js";
import { logger } from "./logger.js";
import { isIgnorableTgError } from "./telegramErrors.js";
import {
  MSG_CONFIRMED_SELF_GROUP_READY,
  MSG_CONFIRMED_SELF_GROUP_NOT_READY,
  MSG_CONFIRMED_INDIVIDUAL_DM,
  MSG_CONFIRMED_INDIVIDUAL_DM_NO_USERNAME,
  MSG_CONFIRMED_INDIVIDUAL_GROUP_PENDING,
  MSG_CONFIRMED_INDIVIDUAL_GROUP_READY,
  MSG_INVITE_COOLDOWN,
  TRN_CONFIRMED,
  TRN_YOOKASSA_PAID,
  TRN_INDIVIDUAL_NEW_STUDENT,
  TRN_INDIVIDUAL_CREATE_GROUP_INSTRUCTION,
  t,
} from "../bot/texts.js";
import type { Purchase, User, Tariff } from "@prisma/client";

type PurchaseWithRelations = Purchase & { user: User; tariff: Tariff };

type TelegramSender = {
  sendMessage: (chatId: number, text: string, extra?: Record<string, unknown>) => Promise<unknown>;
};

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
  } else {
    if (env.INDIVIDUAL_MODE === "DM") {
      const trainerUsername = env.TRAINER_USERNAME?.trim();
      if (trainerUsername) {
        await telegram.sendMessage(
          userChatId,
          t(MSG_CONFIRMED_INDIVIDUAL_DM, {
            EXPIRES_AT: expiresAtStr,
            TRAINER_USERNAME: `@${trainerUsername.replace(/^@/, "")}`,
          })
        );
      } else {
        await telegram.sendMessage(
          userChatId,
          t(MSG_CONFIRMED_INDIVIDUAL_DM_NO_USERNAME, { EXPIRES_AT: expiresAtStr })
        );
      }
      const userLink = `tg://user?id=${purchase.user.telegramId}`;
      const usernameLink = purchase.user.username ? `https://t.me/${purchase.user.username}` : "";
      const trnCard = t(TRN_INDIVIDUAL_NEW_STUDENT, {
        ORDER_CODE: purchase.orderCode,
        NAME: purchase.user.name ?? "—",
        PHONE: purchase.user.phone ?? "—",
        USERNAME: purchase.user.username ? `@${purchase.user.username}` : "—",
        TELEGRAM_ID: String(purchase.user.telegramId),
        EXPIRES_AT: expiresAtStr,
        USER_LINK: userLink,
        USERNAME_LINK: usernameLink,
      });
      await telegram.sendMessage(Number(env.TRAINER_TELEGRAM_ID), trnCard);
    } else {
      const individualChatId = purchase.individualChatId;
      if (!individualChatId) {
        await telegram.sendMessage(userChatId, MSG_CONFIRMED_INDIVIDUAL_GROUP_PENDING);
        const instr = t(TRN_INDIVIDUAL_CREATE_GROUP_INSTRUCTION, {
          ORDER_CODE: purchase.orderCode,
          NAME: purchase.user.name ?? "Ученик",
          USER_LINK: `tg://user?id=${purchase.user.telegramId}`,
          USERNAME: purchase.user.username ? `@${purchase.user.username}` : "—",
          PHONE: purchase.user.phone ?? "—",
        });
        await telegram.sendMessage(Number(env.TRAINER_TELEGRAM_ID), instr);
      } else {
        try {
          const expireMin = env.INDIVIDUAL_INVITE_EXPIRE_MINUTES;
          const link = await createInviteLink(String(individualChatId), env.TELEGRAM_BOT_TOKEN, expireMin);
          const text = t(MSG_CONFIRMED_INDIVIDUAL_GROUP_READY, { EXPIRES_AT: expiresAtStr, INVITE_LINK: link });
          await telegram.sendMessage(userChatId, text, {
            reply_markup: { inline_keyboard: [[{ text: "Перейти в чат", url: link }]] },
          });
          await prisma.purchase.update({
            where: { id: purchase.id },
            data: {
              individualInviteSentAt: now,
              individualLastInviteChatId: individualChatId,
            },
          });
        } catch (e) {
          if (isIgnorableTgError(e)) logger.debug({ err: e }, "Ignorable error creating individual invite");
          else logger.error({ err: e }, "Failed to create individual invite");
          await telegram.sendMessage(userChatId, t(MSG_CONFIRMED_INDIVIDUAL_GROUP_PENDING));
        }
      }
    }
  }

  const trnMsg = t(TRN_CONFIRMED, {
    ORDER_CODE: purchase.orderCode,
    TARIFF_TITLE: purchase.tariff.title,
    EXPIRES_AT: expiresAtStr,
    NAME: purchase.user.name ?? "—",
    PHONE: purchase.user.phone ?? "—",
    TELEGRAM_ID: String(purchase.user.telegramId),
  });
  await telegram.sendMessage(Number(env.TRAINER_TELEGRAM_ID), trnMsg);

  const ykNote = purchase.ykPaymentId
    ? t(TRN_YOOKASSA_PAID, {
        YK_PAYMENT_ID: purchase.ykPaymentId,
        ORDER_CODE: purchase.orderCode,
      })
    : "";
  if (ykNote) {
    try {
      await telegram.sendMessage(Number(env.TRAINER_TELEGRAM_ID), ykNote);
    } catch (e) {
      logger.warn({ err: e }, "Failed to send YooKassa note to trainer");
    }
  }
}
