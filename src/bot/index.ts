import { Telegraf } from "telegraf";
import { getEnv } from "../lib/env.js";
import { loadUser, trainerOnly, type BotContext } from "./middleware.js";
import { MSG_INDIVIDUAL_WRITE_TO_TRAINER, t } from "./texts.js";
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
import { prisma } from "../lib/prisma.js";
import { BTN_START, MSG_FALLBACK_START } from "./texts.js";

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
    if (hasActiveIndividual && ("text" in msg || "photo" in msg || "document" in msg || "video" in msg || "voice" in msg || "animation" in msg || "video_note" in msg)) {
      const env = getEnv();
      if (env.INDIVIDUAL_MODE === "DM" || env.INDIVIDUAL_MODE === "MANUAL_GROUP") {
        const trainerLink = `tg://user?id=${env.TRAINER_TELEGRAM_ID}`;
        const trainerUsername = env.TRAINER_USERNAME
          ? `Напишите ему: @${String(env.TRAINER_USERNAME).replace(/^@/, "")}. `
          : "";
        return ctx.reply(t(MSG_INDIVIDUAL_WRITE_TO_TRAINER, { TRAINER_USERNAME: trainerUsername, TRAINER_LINK: trainerLink }));
      }
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

  bot.on("message", (ctx) => ctx.reply(MSG_FALLBACK_START, startKeyboard()));

  void bot.telegram.setMyCommands([{ command: "start", description: "Начать оформление доступа" }]).catch(() => {});

  return bot;
}
