import type { BotContext } from "../middleware.js";
import { prisma } from "../../lib/prisma.js";
import { getEnv } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { getSelfGroupId, setSelfGroupChatId, createInviteLink, isTrainer } from "../services.js";
import { CALLBACK } from "../keyboards.js";
import { Markup } from "telegraf";
import { assertTransitionAllowed } from "../../lib/purchaseInvariants.js";
import { isIgnorableTgError } from "../../lib/telegramErrors.js";
import { activatePurchase } from "../../lib/activatePurchase.js";
import {
  TRN_BIND_OK,
  TRN_CONFIRMED,
  TRN_REJECTED,
  MSG_CONFIRMED_SELF_GROUP_READY,
  MSG_CONFIRMED_SELF_GROUP_NOT_READY,
  MSG_CONFIRMED_INDIVIDUAL,
  MSG_CONFIRMED_INDIVIDUAL_GROUP_READY,
  MSG_REJECTED,
  TRN_INDIVIDUAL_BOUND_OK,
  TRN_BOT_NOT_ADMIN,
  t,
  BTN_GRANT_ACCESS,
} from "../texts.js";

export async function handleBindSelfGroup(ctx: BotContext) {
  const chat = ctx.chat;
  const from = ctx.from;
  if (!from || !chat) return;
  if (BigInt(from.id) !== getEnv().TRAINER_TELEGRAM_ID) return;
  if (chat.type === "private") {
    return ctx.reply("Выполните эту команду в нужном общем чате (группе), куда нужно добавлять учеников.");
  }
  await setSelfGroupChatId(String(chat.id));

  const pendingCount = await prisma.purchase.count({
    where: { status: "active", accessPending: true, tariff: { type: "SELF" } },
  });
  if (pendingCount > 0) {
    return ctx.reply(
      t(TRN_BIND_OK, { PENDING_COUNT: String(pendingCount) }),
      Markup.inlineKeyboard([
        [Markup.button.callback(`${BTN_GRANT_ACCESS} (${pendingCount})`, CALLBACK.GRANT_PENDING_SELF)],
      ])
    );
  }
  return ctx.reply(`Чат привязан. chat_id: ${chat.id}. Теперь новые ученики тарифа «Самостоятельный» будут получать инвайт-ссылку.`);
}

export async function handleGrantPendingSelf(ctx: BotContext) {
  const from = ctx.from;
  if (!from || BigInt(from.id) !== getEnv().TRAINER_TELEGRAM_ID) return;
  const env = getEnv();
  const selfChatId = await getSelfGroupId();
  if (!selfChatId) {
    return ctx.reply("Сначала привяжите общий чат командой /bind_self_group в нужной группе.");
  }

  const pending = await prisma.purchase.findMany({
    where: { status: "active", accessPending: true, tariff: { type: "SELF" } },
    include: { user: true, tariff: true },
  });

  const selfChatIdBig = BigInt(selfChatId);
  const cooldownMs = env.INVITE_COOLDOWN_MINUTES * 60 * 1000;
  const now = new Date();
  let sent = 0;
  let skipped = 0;
  for (const p of pending) {
    const sameChat = p.lastInviteChatId != null && p.lastInviteChatId === selfChatIdBig;
    if (sameChat && p.inviteSentAt && now.getTime() - p.inviteSentAt.getTime() < cooldownMs) {
      skipped++;
      continue;
    }
    try {
      const link = await createInviteLink(selfChatId, env.TELEGRAM_BOT_TOKEN);
      await ctx.telegram.sendMessage(
        Number(p.user.telegramId),
        `Доступ в общий чат курса активирован. Перейдите по ссылке (действует 10 минут):\n${link}`
      );
      await prisma.purchase.update({
        where: { id: p.id },
        data: { accessPending: false, inviteSentAt: now, lastInviteChatId: selfChatIdBig },
      });
      sent++;
    } catch (e) {
      if (isIgnorableTgError(e)) {
        logger.debug({ purchaseId: p.id, userId: p.userId }, "Ignorable error sending invite");
      } else {
        logger.error({ err: e, purchaseId: p.id, userId: p.userId }, "Failed to send invite to user");
      }
    }
  }

  const msg = skipped > 0
    ? `Разослано инвайт-ссылок: ${sent} из ${pending.length} (пропущено ${skipped} по кулдауну).`
    : `Разослано инвайт-ссылок: ${sent} из ${pending.length}.`;
  return ctx.reply(msg);
}

export async function handleGrantPendingSelfCallback(ctx: BotContext) {
  await ctx.answerCbQuery?.();
  const from = ctx.from;
  if (!from || BigInt(from.id) !== getEnv().TRAINER_TELEGRAM_ID) return;
  return handleGrantPendingSelf(ctx);
}

export async function handleConfirmRejectCallback(ctx: BotContext) {
  const from = ctx.from;
  if (!from || !isTrainer(BigInt(from.id))) return;
  const cb = ctx.callbackQuery;
  if (!cb || !("data" in cb) || typeof cb.data !== "string") return;

  const data = cb.data as string;
  const isConfirm = data.startsWith(CALLBACK.CONFIRM_PREFIX);
  const isReject = data.startsWith(CALLBACK.REJECT_PREFIX);
  if (!isConfirm && !isReject) return;

  const purchaseId = data.replace(CALLBACK.CONFIRM_PREFIX, "").replace(CALLBACK.REJECT_PREFIX, "");
  await ctx.answerCbQuery?.();

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { user: true, tariff: true },
  });
  if (!purchase) {
    return ctx.editMessageText?.("Заявка не найдена.");
  }
  if (purchase.status !== "pending") {
    return ctx.editMessageText?.(`Заявка уже обработана (статус: ${purchase.status}).`);
  }
  if (purchase.paymentProvider === "YOOKASSA") {
    return ctx.editMessageText?.(`Оплата по ЮKassa. Для ручного действия: /force_activate ${purchase.orderCode} или /force_reject ${purchase.orderCode}`);
  }

  const trainerTelegramId = BigInt(from.id);
  const now = new Date();

  if (isReject) {
    assertTransitionAllowed("pending", "rejected", {
      reviewedAt: now,
      reviewedBy: trainerTelegramId,
      rejectReason: "manual_reject",
    });
    const result = await prisma.purchase.updateMany({
      where: { id: purchaseId, status: "pending" },
      data: {
        status: "rejected",
        reviewedAt: now,
        reviewedBy: trainerTelegramId,
        rejectReason: "manual_reject",
      },
    });
    if (result.count === 0) {
      return ctx.editMessageText?.("Заявка уже обработана.");
    }
    await ctx.telegram.sendMessage(Number(purchase.user.telegramId), MSG_REJECTED);
    const trnMsg = t(TRN_REJECTED, {
      ORDER_CODE: purchase.orderCode,
      REJECT_REASON: "manual_reject",
      NAME: purchase.user.name ?? "—",
      TELEGRAM_ID: String(purchase.user.telegramId),
    });
    await ctx.telegram.sendMessage(Number(getEnv().TRAINER_TELEGRAM_ID), trnMsg);
    return ctx.editMessageText?.(ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message
      ? (ctx.callbackQuery.message as { text: string }).text + "\n\n❌ Отклонено."
      : "Заявка отклонена.");
  }

  const existingActive = await prisma.purchase.findFirst({
    where: { orderCode: purchase.orderCode, status: "active" },
  });
  if (existingActive) {
    return ctx.editMessageText?.("Эта оплата уже была подтверждена ранее (идемпотентность).");
  }

  const expiresAt = new Date(now.getTime() + purchase.tariff.durationDays * 24 * 60 * 60 * 1000);
  const expiresAtStr = expiresAt.toLocaleDateString("ru-RU");
  assertTransitionAllowed("pending", "active", { accessExpiresAt: expiresAt });

  const result = await prisma.purchase.updateMany({
    where: { id: purchaseId, status: "pending" },
    data: {
      status: "active",
      accessExpiresAt: expiresAt,
      accessPending: purchase.tariff.type === "SELF",
      reviewedAt: now,
      reviewedBy: trainerTelegramId,
      rejectReason: null,
    },
  });
  if (result.count === 0) {
    return ctx.editMessageText?.("Заявка уже обработана (гонка).");
  }

  const env = getEnv();
  const selfChatId = await getSelfGroupId();
  const selfChatIdBig = selfChatId ? BigInt(selfChatId) : null;

  if (purchase.tariff.type === "SELF") {
    if (selfChatId) {
      try {
        const link = await createInviteLink(selfChatId, env.TELEGRAM_BOT_TOKEN);
        await ctx.telegram.sendMessage(
          Number(purchase.user.telegramId),
          t(MSG_CONFIRMED_SELF_GROUP_READY, { EXPIRES_AT: expiresAtStr, INVITE_LINK: link })
        );
        await prisma.purchase.update({
          where: { id: purchaseId },
          data: { accessPending: false, inviteSentAt: now, lastInviteChatId: selfChatIdBig },
        });
      } catch (e) {
        if (isIgnorableTgError(e)) {
          logger.debug({ err: e }, "Ignorable error creating invite");
        } else {
          logger.error({ err: e }, "Failed to create invite for SELF");
        }
        await ctx.telegram.sendMessage(
          Number(purchase.user.telegramId),
          t(MSG_CONFIRMED_SELF_GROUP_NOT_READY, { EXPIRES_AT: expiresAtStr })
        );
      }
    } else {
      await ctx.telegram.sendMessage(
        Number(purchase.user.telegramId),
        t(MSG_CONFIRMED_SELF_GROUP_NOT_READY, { EXPIRES_AT: expiresAtStr })
      );
    }
  } else {
    await ctx.telegram.sendMessage(
      Number(purchase.user.telegramId),
      t(MSG_CONFIRMED_INDIVIDUAL, { EXPIRES_AT: expiresAtStr })
    );
  }

  const trnConfirmed = t(TRN_CONFIRMED, {
    ORDER_CODE: purchase.orderCode,
    TARIFF_TITLE: purchase.tariff.title,
    EXPIRES_AT: expiresAtStr,
    NAME: purchase.user.name ?? "—",
    PHONE: purchase.user.phone ?? "—",
    TELEGRAM_ID: String(purchase.user.telegramId),
  });
  await ctx.telegram.sendMessage(Number(env.TRAINER_TELEGRAM_ID), trnConfirmed);

  return ctx.editMessageText?.(
    (ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message
      ? (ctx.callbackQuery.message as { text: string }).text
      : "") + "\n\n✅ Подтверждено."
  );
}

/** Тренер: привязать группу к индивидуальному заказу и отправить инвайт ученику. Выполнять в группе. */
export async function handleBindIndividualChat(ctx: BotContext) {
  const from = ctx.from;
  const chat = ctx.chat;
  if (!from || BigInt(from.id) !== getEnv().TRAINER_TELEGRAM_ID) return;
  if (!chat || chat.type === "private") {
    return ctx.reply("Выполните команду в группе, которую создали для этого ученика (добавьте бота админом).");
  }

  const text = ctx.message && "text" in ctx.message ? ctx.message.text ?? "" : "";
  const orderCode = text.split(/\s+/)[1]?.trim();
  if (!orderCode || !orderCode.startsWith("ORDER-")) {
    return ctx.reply("Использование: /bind_individual_chat ORDER-YYYYMMDD-XXXXX");
  }

  const purchase = await prisma.purchase.findUnique({
    where: { orderCode },
    include: { user: true, tariff: true },
  });
  if (!purchase) {
    return ctx.reply("Заказ не найден.");
  }
  if (purchase.tariff.type !== "INDIVIDUAL" || purchase.status !== "active") {
    return ctx.reply("Заказ должен быть индивидуальным и активным.");
  }

  try {
    const me = await ctx.telegram.getMe();
    const member = await ctx.telegram.getChatMember(chat.id, me.id);
    const status = member.status;
    const canInvite =
      status === "creator" ||
      (status === "administrator" && (member as { can_invite_users?: boolean }).can_invite_users);
    if (!canInvite) {
      return ctx.reply(TRN_BOT_NOT_ADMIN);
    }
  } catch (e) {
    logger.warn({ err: e, chatId: chat.id }, "getChatMember failed in bind_individual_chat");
    return ctx.reply(TRN_BOT_NOT_ADMIN);
  }

  const chatIdBig = BigInt(chat.id);
  const env = getEnv();
  const expireMin = env.INDIVIDUAL_INVITE_EXPIRE_MINUTES;

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { individualChatId: chatIdBig },
  });

  try {
    const link = await createInviteLink(String(chat.id), env.TELEGRAM_BOT_TOKEN);
    const expiresAtStr = purchase.accessExpiresAt?.toLocaleDateString("ru-RU") ?? "";
    const msgText = t(MSG_CONFIRMED_INDIVIDUAL_GROUP_READY, { EXPIRES_AT: expiresAtStr, INVITE_LINK: link });
    await ctx.telegram.sendMessage(Number(purchase.user.telegramId), msgText, {
      reply_markup: { inline_keyboard: [[{ text: "Перейти в чат", url: link }]] },
    });
    const now = new Date();
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { individualInviteSentAt: now, individualLastInviteChatId: chatIdBig },
    });
  } catch (e) {
    if (isIgnorableTgError(e)) {
      logger.debug({ err: e }, "Ignorable error sending individual invite");
    } else {
      logger.error({ err: e, purchaseId: purchase.id }, "Failed to send individual invite");
      return ctx.reply("Не удалось создать инвайт или отправить ученику. Проверьте, что бот админ группы.");
    }
  }
  return ctx.reply(TRN_INDIVIDUAL_BOUND_OK);
}

/** Тренер: принудительная активация (если деньги прошли, а webhook не пришёл) */
export async function handleForceActivate(ctx: BotContext) {
  const from = ctx.from;
  if (!from || BigInt(from.id) !== getEnv().TRAINER_TELEGRAM_ID) return;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text ?? "" : "";
  const orderCode = text.split(/\s+/)[1]?.trim();
  if (!orderCode || !orderCode.startsWith("ORDER-")) {
    return ctx.reply("Использование: /force_activate ORDER-YYYYMMDD-XXXXX");
  }

  const purchase = await prisma.purchase.findUnique({
    where: { orderCode },
    include: { user: true, tariff: true },
  });
  if (!purchase) {
    return ctx.reply("Заказ не найден.");
  }
  if (purchase.status !== "pending") {
    return ctx.reply(`Заказ уже обработан (статус: ${purchase.status}).`);
  }

  await activatePurchase(purchase, ctx.telegram);
  return ctx.reply(`✅ Заказ ${orderCode} активирован вручную.`);
}

/** Тренер: принудительное отклонение спорной заявки */
export async function handleForceReject(ctx: BotContext) {
  const from = ctx.from;
  if (!from || BigInt(from.id) !== getEnv().TRAINER_TELEGRAM_ID) return;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text ?? "" : "";
  const orderCode = text.split(/\s+/)[1]?.trim();
  if (!orderCode || !orderCode.startsWith("ORDER-")) {
    return ctx.reply("Использование: /force_reject ORDER-YYYYMMDD-XXXXX");
  }

  const purchase = await prisma.purchase.findUnique({
    where: { orderCode },
    include: { user: true },
  });
  if (!purchase) {
    return ctx.reply("Заказ не найден.");
  }
  if (purchase.status !== "pending") {
    return ctx.reply(`Заказ уже обработан (статус: ${purchase.status}).`);
  }

  const now = new Date();
  await prisma.purchase.update({
    where: { orderCode },
    data: {
      status: "rejected",
      rejectReason: "force_reject",
      reviewedAt: now,
      reviewedBy: BigInt(from.id),
    },
  });
  try {
    await ctx.telegram.sendMessage(Number(purchase.user.telegramId), MSG_REJECTED);
  } catch (e) {
    logger.warn({ err: e }, "Failed to notify user on force_reject");
  }
  return ctx.reply(`❌ Заказ ${orderCode} отклонён.`);
}
