import type { BotContext } from "../middleware.js";
import { prisma } from "../../lib/prisma.js";
import { requestContactKeyboard, tariffKeyboard } from "../keyboards.js";
import { MSG_ASK_PHONE, MSG_PHONE_SAVED } from "../texts.js";

/**
 * Сохраняет имя из текстового сообщения и переходит к запросу телефона или тарифа.
 * @param {BotContext} ctx - Контекст Telegraf (message с text)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleTextName(ctx: BotContext) {
  const user = ctx.user;
  const msg = ctx.message;
  const text = msg && "text" in msg ? msg.text?.trim() : undefined;
  if (!user || !text) return;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name: text },
  });
  ctx.user = { ...user, name: updated.name };

  if (!updated.phone) {
    return ctx.reply(MSG_ASK_PHONE, requestContactKeyboard());
  }
  return ctx.reply(MSG_PHONE_SAVED, tariffKeyboard());
}

/**
 * Сохраняет телефон из shared contact и показывает выбор тарифа.
 * @param {BotContext} ctx - Контекст Telegraf (message с contact)
 * @returns {Promise<import("telegraf").Message.TextMessage | undefined>}
 */
export async function handleContact(ctx: BotContext) {
  const user = ctx.user;
  const msg = ctx.message;
  const phone = msg && "contact" in msg ? msg.contact?.phone_number : undefined;
  if (!user || !phone) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { phone },
  });
  ctx.user = { ...user, phone };

  return ctx.reply(MSG_PHONE_SAVED, tariffKeyboard());
}
