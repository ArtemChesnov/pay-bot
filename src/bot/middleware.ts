import type { Context } from "telegraf";

type Next = () => Promise<void>;
import { prisma } from "../lib/prisma.js";
import { isTrainer } from "./services.js";
import { TRN_COMMAND_TRAINER_ONLY } from "./texts.js";

export interface BotContext extends Context {
  user?: { id: string; telegramId: bigint; username: string | null; firstName: string | null; name: string | null; phone: string | null; consentAt: Date | null };
}

/**
 * Middleware: загружает пользователя из БД по telegramId и записывает в ctx.user.
 * @param {BotContext} ctx - Контекст Telegraf
 * @param {Next} next - Следующий middleware/handler
 * @returns {Promise<void>}
 */
export async function loadUser(ctx: BotContext, next: Next) {
  const from = ctx.from;
  if (!from) return next();
  const telegramId = BigInt(from.id);
  let user = await prisma.user.findUnique({ where: { telegramId } });
  if (user) {
    ctx.user = {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      name: user.name,
      phone: user.phone,
      consentAt: user.consentAt,
    };
  }
  return next();
}

/**
 * Middleware: пропускает только тренера; остальным отправляет TRN_COMMAND_TRAINER_ONLY.
 * @param {BotContext} ctx - Контекст Telegraf
 * @param {Next} next - Следующий middleware/handler
 * @returns {Promise<void> | import("telegraf").Message.TextMessage}
 */
export function trainerOnly(ctx: BotContext, next: Next) {
  const from = ctx.from;
  if (!from) return next();
  if (isTrainer(BigInt(from.id))) return next();
  return ctx.reply(TRN_COMMAND_TRAINER_ONLY);
}
