import type { BotContext } from "../middleware.js";
import { prisma } from "../../lib/prisma.js";
import { getEnv } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { MSG_INDIVIDUAL_BLOCKED, MSG_FORWARD_FAIL, MSG_SUPPORT_SENT, MSG_SUPPORT_UNSUPPORTED, MSG_FORWARD_FAIL_TRAINER } from "../texts.js";
import { logAnalyticsEvent } from "../../lib/analytics.js";

/**
 * Пересылает сообщение пользователя тренеру (индивидуальный тариф).
 * Создаёт запись в supportMessageMap для ответа reply-to.
 * @param {BotContext} ctx - Контекст Telegraf (message от пользователя)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function forwardUserToTrainer(ctx: BotContext) {
  const from = ctx.from;
  const user = ctx.user;
  if (!from || !user) return;

  const active = await prisma.purchase.findFirst({
    where: {
      userId: user.id,
      status: "active",
      accessExpiresAt: { gt: new Date() },
      tariff: { type: "INDIVIDUAL" },
    },
    include: { tariff: true },
  });
  if (!active) {
    return ctx.reply(MSG_INDIVIDUAL_BLOCKED);
  }

  const env = getEnv();
  const trainerId = Number(env.TRAINER_TELEGRAM_ID);
  const header = `От: ${user.name ?? "—"} | ${user.phone ?? "—"} | до ${active.accessExpiresAt?.toLocaleDateString("ru-RU") ?? "—"}\n---`;
  const chatId = ctx.chat?.id ?? from.id;
  const msg = ctx.message;
  if (!msg || !("message_id" in msg)) return ctx.reply(MSG_FORWARD_FAIL_TRAINER);

  let sentMessageId: number | undefined;
  try {
    if ("text" in msg && msg.text) {
      const sent = await ctx.telegram.sendMessage(trainerId, header + "\n" + msg.text);
      sentMessageId = sent.message_id;
    } else if ("photo" in msg || "video" in msg || "voice" in msg || "document" in msg || "animation" in msg || "video_note" in msg) {
      await ctx.telegram.sendMessage(trainerId, header);
      const forwarded = await ctx.telegram.forwardMessage(trainerId, chatId, msg.message_id);
      sentMessageId = forwarded.message_id;
    } else {
      return ctx.reply(MSG_SUPPORT_UNSUPPORTED);
    }
  } catch (e) {
    logger.warn({ err: e, trainerId }, "Forward to trainer failed — проверьте TRAINER_TELEGRAM_ID и что тренер писал боту /start");
    return ctx.reply(MSG_FORWARD_FAIL);
  }

  if (sentMessageId !== undefined) {
    await prisma.supportMessageMap.create({
      data: {
        trainerChatId: BigInt(trainerId),
        trainerMessageId: sentMessageId,
        userTelegramId: user.telegramId,
      },
    });
  }
  logAnalyticsEvent("support_message_sent", {
    userId: String(user.id),
    purchaseId: active.id,
    orderCode: active.orderCode,
    tariffType: active.tariff.type,
    source: "individual_support",
  });
  return ctx.reply(MSG_SUPPORT_SENT);
}

/**
 * Доставляет ответ тренера пользователю при reply на пересланное сообщение.
 * Ищет userTelegramId по supportMessageMap.
 * @param {BotContext} ctx - Контекст Telegraf (message от тренера с reply_to_message)
 * @returns {Promise<void>}
 */
export async function deliverTrainerReplyToUser(ctx: BotContext) {
  const from = ctx.from;
  const msg = ctx.message;
  if (!from || !msg) return;
  const trainerId = BigInt(from.id);
  if (trainerId !== getEnv().TRAINER_TELEGRAM_ID) return;

  const replyTo = "reply_to_message" in msg ? msg.reply_to_message : null;
  if (!replyTo || !("message_id" in replyTo)) return;

  const chatId = replyTo.chat?.id;
  if (chatId === undefined) return;

  const map = await prisma.supportMessageMap.findUnique({
    where: {
      trainerChatId_trainerMessageId: {
        trainerChatId: BigInt(chatId),
        trainerMessageId: replyTo.message_id,
      },
    },
  });
  if (!map) return;

  const userTelegramId = Number(map.userTelegramId);
  try {
    if ("photo" in msg && msg.photo?.length) {
      await ctx.telegram.sendPhoto(userTelegramId, msg.photo[msg.photo.length - 1].file_id, {
        caption: msg.caption ?? undefined,
      });
    } else if ("text" in msg && msg.text) {
      await ctx.telegram.sendMessage(userTelegramId, msg.text);
    } else if ("document" in msg && msg.document) {
      await ctx.telegram.sendDocument(userTelegramId, msg.document.file_id, {
        caption: msg.caption ?? undefined,
      });
    } else if ("voice" in msg && msg.voice) {
      await ctx.telegram.sendVoice(userTelegramId, msg.voice.file_id, {
        caption: msg.caption ?? undefined,
      });
    } else if ("video" in msg && msg.video) {
      await ctx.telegram.sendVideo(userTelegramId, msg.video.file_id, {
        caption: msg.caption ?? undefined,
      });
    } else if ("video_note" in msg && msg.video_note) {
      await ctx.telegram.sendVideoNote(userTelegramId, msg.video_note.file_id);
    }
  } catch {
    await ctx.reply(MSG_FORWARD_FAIL_TRAINER);
  }
}
