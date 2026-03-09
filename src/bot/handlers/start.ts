import type { BotContext } from "../middleware.js";
import { consentKeyboard, requestContactKeyboard, startKeyboard, tariffKeyboard } from "../keyboards.js";
import { getEnv } from "../../lib/env.js";
import {
  MSG_WELCOME_PROMO,
  MSG_START_LEGAL,
  MSG_ASK_NAME,
  MSG_ASK_PHONE,
  MSG_PHONE_SAVED,
  MSG_TRAINER_WELCOME,
  t,
} from "../texts.js";

/**
 * Отправляет промо-приветствие: один HTML-блок и inline-кнопка «Начать».
 * Без превью ссылок. По нажатию кнопки вызывается handleStartButton (legal screen).
 * @param {BotContext} ctx - Контекст Telegraf
 * @returns {Promise<import("telegraf").Message.TextMessage>}
 */
async function sendWelcomePromo(ctx: BotContext) {
  return ctx.reply(MSG_WELCOME_PROMO, {
    parse_mode: "HTML",
    ...startKeyboard(),
  });
}

/**
 * Обработчик /start и текста «✨ Начать».
 * Если нет согласия — промо-приветствие + кнопка «Начать». Если есть — следующий шаг (имя/телефон/тариф).
 * @param {BotContext} ctx - Контекст Telegraf
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleStart(ctx: BotContext) {
  const from = ctx.from;
  if (from && BigInt(from.id) === getEnv().TRAINER_TELEGRAM_ID) {
    return ctx.reply(MSG_TRAINER_WELCOME);
  }
  const chatType = ctx.chat?.type;
  if (chatType && chatType !== "private") {
    // В группах и супергруппах /start для клиентов не нужен — ничего не делаем.
    return;
  }
  if (ctx.user?.consentAt) {
    if (!ctx.user.name) {
      return ctx.reply(MSG_ASK_NAME);
    }
    if (!ctx.user.phone) {
      return ctx.reply(MSG_ASK_PHONE, requestContactKeyboard());
    }
    return ctx.reply(MSG_PHONE_SAVED, tariffKeyboard());
  }

  return sendWelcomePromo(ctx);
}

/**
 * Обработчик callback «✨ Начать»: показывает экран с политикой, офертой и кнопками согласия.
 * Создаёт/обновляет пользователя в БД при согласии (в handleConsent).
 * @param {BotContext} ctx - Контекст Telegraf (callback_query)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleStartButton(ctx: BotContext) {
  try {
    if (typeof ctx.answerCbQuery === "function") {
      await ctx.answerCbQuery();
    }
  } catch {
    // игнорируем ошибку answerCbQuery, продолжаем показывать экран
  }
  try {
    const env = getEnv();
    const baseUrl = (env.WEBHOOK_BASE_URL || `http://localhost:${env.PORT}`).replace(/\/$/, "");
    const policyUrl = `${baseUrl}/policy`;
    const offerUrl = `${baseUrl}/offer`;
    const text = t(MSG_START_LEGAL, { POLICY_URL: policyUrl, OFFER_URL: offerUrl });
    return ctx.reply(text, consentKeyboard());
  } catch (err) {
    if (typeof ctx.answerCbQuery === "function") {
      await ctx.answerCbQuery("Ошибка. Попробуй ещё раз или /start").catch(() => {});
    }
    return ctx.reply("Не удалось загрузить экран. Нажми /start или кнопку «Начать» ещё раз.").catch(() => undefined);
  }
}
