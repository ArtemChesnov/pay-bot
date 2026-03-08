import { Telegraf } from "telegraf";
import { getEnv } from "../lib/env.js";
import { loadUser, trainerOnly, type BotContext } from "./middleware.js";
import { handleStart, handleStartButton } from "./handlers/start.js";
import { handleConsent, handleConsentDecline } from "./handlers/consent.js";
import { handleTextName, handleContact } from "./handlers/userData.js";
import { handleTariffSelf, handleTariffIndividual, handleReplacePending } from "./handlers/tariff.js";
import { handlePaymentDone, handlePaymentProof } from "./handlers/payment.js";
import { handleCheckPayment } from "./handlers/checkPayment.js";
import { handleBindSelfGroup, handleGrantPendingSelf, handleGrantPendingSelfCallback, handleBindIndividualChat, handleConfirmRejectCallback, handleForceActivate, handleForceReject } from "./handlers/trainer.js";
import { forwardUserToTrainer, deliverTrainerReplyToUser } from "./handlers/support.js";
import { handleWhoami, handleExportPurchases } from "./handlers/admin.js";
import { CALLBACK, startKeyboard } from "./keyboards.js";
import { setSelfGroupChatId, getSelfGroupId, createInviteLink } from "./services.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { BTN_START, MSG_FALLBACK_START, MSG_TRAINER_WELCOME, MSG_CONFIRMED_SELF_GROUP_READY, MSG_INVITE_COOLDOWN, t } from "./texts.js";

/** Из ответа Telegram «group chat was upgraded to a supergroup» достаёт migrate_to_chat_id */
function getMigrateToChatId(err: unknown): number | undefined {
  const o = err && typeof err === "object" ? err as Record<string, unknown> : null;
  const params = o?.response && typeof o.response === "object"
    ? (o.response as Record<string, unknown>).parameters
    : o?.parameters;
  if (params && typeof params === "object" && typeof (params as Record<string, unknown>).migrate_to_chat_id === "number") {
    return (params as Record<string, number>).migrate_to_chat_id;
  }
  return undefined;
}

/**
 * Создаёт и настраивает экземпляр Telegraf-бота: команды, actions, message handlers.
 * Регистрирует start flow с кнопкой «Начать», fallback с дружелюбным текстом, setMyCommands.
 * @returns {Telegraf<BotContext>} Настроенный бот
 */
export function createBot() {
  const env = getEnv();
  const bot = new Telegraf<BotContext>(env.TELEGRAM_BOT_TOKEN);

  bot.use(loadUser);

  bot.command("start", handleStart);

  bot.command("bind_self_group", trainerOnly, handleBindSelfGroup);
  bot.command("grant_pending_self", trainerOnly, handleGrantPendingSelf);
  bot.command("bind_individual_chat", trainerOnly, handleBindIndividualChat);
  bot.command("force_activate", trainerOnly, handleForceActivate);
  bot.command("force_reject", trainerOnly, handleForceReject);
  bot.command("whoami", trainerOnly, handleWhoami);
  bot.command("export_purchases", trainerOnly, handleExportPurchases);

  bot.action(CALLBACK.START_BUTTON, handleStartButton);
  bot.action(CALLBACK.POLICY_OFFER_CONSENT, handleConsent);
  bot.action(CALLBACK.CONSENT_DECLINE, handleConsentDecline);
  bot.action(CALLBACK.TARIFF_SELF, handleTariffSelf);
  bot.action(CALLBACK.TARIFF_INDIVIDUAL, handleTariffIndividual);
  bot.action(new RegExp(`^${CALLBACK.REPLACE_PENDING_PREFIX}.+`), handleReplacePending);
  bot.action(CALLBACK.PAYMENT_DONE, handlePaymentDone);
  bot.action(new RegExp(`^${CALLBACK.CHECK_PAYMENT_PREFIX}.+`), handleCheckPayment);
  bot.action(CALLBACK.GRANT_PENDING_SELF, trainerOnly, handleGrantPendingSelfCallback);
  bot.action(/^(confirm_|reject_)(.+)$/, handleConfirmRejectCallback);

  bot.on("message", async (ctx, next) => {
    const from = ctx.from;
    const user = ctx.user;
    const msg = ctx.message;

    if (!from || !msg) return next();

    const trainerId = getEnv().TRAINER_TELEGRAM_ID;
    const isTrainer = BigInt(from.id) === trainerId;

    if (isTrainer && "reply_to_message" in msg && msg.reply_to_message) {
      await deliverTrainerReplyToUser(ctx);
      return;
    }

    if ("contact" in msg && msg.contact && user && !user.phone) {
      await handleContact(ctx);
      return;
    }

    const hasPendingPurchase = user
      ? await prisma.purchase.findFirst({ where: { userId: user.id, status: "pending" } }).then(Boolean)
      : false;
    const hasActiveSelf = user
      ? await prisma.purchase.findFirst({
          where: {
            userId: user.id,
            status: "active",
            accessExpiresAt: { gt: new Date() },
            tariff: { type: "SELF" },
          },
          include: { tariff: true },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const hasActiveIndividual = user
      ? await prisma.purchase
          .findFirst({
            where: {
              userId: user.id,
              status: "active",
              accessExpiresAt: { gt: new Date() },
              tariff: { type: "INDIVIDUAL" },
            },
          })
          .then(Boolean)
      : false;

    if (hasPendingPurchase && ("photo" in msg || "text" in msg)) {
      await handlePaymentProof(ctx);
      return;
    }
    if (hasActiveSelf && ctx.chat?.type === "private" && ("text" in msg || "photo" in msg)) {
      const selfChatId = await getSelfGroupId();
      if (selfChatId) {
        const env = getEnv();
        const now = new Date();
        const expiresAtStr = hasActiveSelf.accessExpiresAt?.toLocaleDateString("ru-RU") ?? "";
        const selfChatIdBig = BigInt(selfChatId);
        const cooldownMs = env.INVITE_COOLDOWN_MINUTES * 60 * 1000;
        const withinCooldown =
          hasActiveSelf.inviteSentAt &&
          hasActiveSelf.lastInviteChatId === selfChatIdBig &&
          now.getTime() - hasActiveSelf.inviteSentAt.getTime() < cooldownMs;
        if (withinCooldown) {
          await ctx.reply(t(MSG_INVITE_COOLDOWN, { MINUTES: String(env.INVITE_COOLDOWN_MINUTES) }));
          return;
        }
        try {
          const link = await createInviteLink(selfChatId, env.TELEGRAM_BOT_TOKEN);
          const text = t(MSG_CONFIRMED_SELF_GROUP_READY, { EXPIRES_AT: expiresAtStr, INVITE_LINK: link });
          await ctx.reply(text, {
            reply_markup: { inline_keyboard: [[{ text: "Перейти в чат", url: link }]] },
          });
          await prisma.purchase.update({
            where: { id: hasActiveSelf.id },
            data: {
              accessPending: false,
              inviteSentAt: now,
              lastInviteChatId: selfChatIdBig,
            },
          });
          return;
        } catch (e) {
          logger.warn({ err: e }, "Create invite for SELF (on message) failed");
        }
      }
    }
    if (hasActiveIndividual && ("text" in msg || "photo" in msg || "document" in msg || "video" in msg || "voice" in msg || "animation" in msg || "video_note" in msg)) {
      await forwardUserToTrainer(ctx);
      return;
    }
    if (user && user.consentAt && !user.name && "text" in msg && msg.text) {
      await handleTextName(ctx);
      return;
    }

    if ("text" in msg && msg.text?.trim() === BTN_START) {
      await handleStart(ctx);
      return;
    }

    return next();
  });

  bot.on("message", async (ctx) => {
    const from = ctx.from;
    const chatType = ctx.chat?.type;
    if (chatType === "group" || chatType === "supergroup") {
      return;
    }
    if (from && BigInt(from.id) === getEnv().TRAINER_TELEGRAM_ID) {
      await ctx.reply(MSG_TRAINER_WELCOME);
      return;
    }
    try {
      await ctx.reply(MSG_FALLBACK_START, startKeyboard());
    } catch (err) {
      const newChatId = getMigrateToChatId(err);
      if (newChatId !== undefined) {
        logger.info({ oldChatId: ctx.chat?.id, migrate_to_chat_id: newChatId }, "Group upgraded to supergroup, updating SELF_GROUP_ID");
        await setSelfGroupChatId(String(newChatId));
        await ctx.telegram.sendMessage(newChatId, MSG_FALLBACK_START, startKeyboard());
        return;
      }
      logger.warn({ err, chatId: ctx.chat?.id }, "Fallback reply failed");
    }
  });

  bot.catch((err, ctx) => {
    const newChatId = getMigrateToChatId(err);
    if (newChatId !== undefined) {
      logger.info({ migrate_to_chat_id: newChatId }, "Telegram: group upgraded to supergroup (update SELF_GROUP_ID to this id)");
      void setSelfGroupChatId(String(newChatId)).catch((e) => logger.warn({ err: e }, "setSelfGroupChatId failed"));
    }
    logger.warn({ err, updateType: ctx.updateType }, "Bot handler error");
  });

  void bot.telegram.setMyCommands([{ command: "start", description: "Начать оформление доступа" }]).catch(() => {});

  return bot;
}
