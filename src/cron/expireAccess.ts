import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { getPayment } from "../lib/yookassa.js";
import { activatePurchase } from "../lib/activatePurchase.js";
import { getSelfGroupChatId } from "../bot/services.js";
import { isIgnorableTgError } from "../lib/telegramErrors.js";
import { MSG_EXPIRED_SELF, MSG_EXPIRED_INDIVIDUAL, TRN_EXPIRED, t } from "../bot/texts.js";

export function startCron() {
  const tz = getEnv().CRON_TZ;
  cron.schedule("0 3 * * *", async () => {
    await expirePending();
    await expireAccess();
  }, { timezone: tz });
  logger.info({ timezone: tz }, "Cron: daily expire pending + access at 03:00");
}

/**
 * Pending таймауты:
 * a) proofSubmittedAt IS NULL → timeout через PENDING_TIMEOUT_HOURS от createdAt.
 *    Для YooKassa-платежей с ykPaymentId перед reject делаем getPayment; если succeeded — активируем.
 * b) proofSubmittedAt NOT NULL → timeout через REVIEW_TIMEOUT_DAYS от proofSubmittedAt (заявка ждёт решения)
 */
async function expirePending() {
  const env = getEnv();
  const now = new Date();
  const deadlineNoProof = new Date(now.getTime() - env.PENDING_TIMEOUT_HOURS * 60 * 60 * 1000);
  const deadlineWithProof = new Date(now.getTime() - env.REVIEW_TIMEOUT_DAYS * 24 * 60 * 60 * 1000);

  const pendingNoProof = await prisma.purchase.findMany({
    where: { status: "pending", proofSubmittedAt: null, createdAt: { lt: deadlineNoProof } },
    include: { user: true, tariff: true },
  });
  const pendingWithProof = await prisma.purchase.findMany({
    where: { status: "pending", proofSubmittedAt: { not: null, lt: deadlineWithProof } },
    select: { id: true },
  });

  const systemReviewer = BigInt(0);
  let noProofRejected = 0;
  const bot =
    pendingNoProof.some((p) => p.paymentProvider === "YOOKASSA" && p.ykPaymentId) ||
    pendingNoProof.length > 0
      ? await import("telegraf").then((m) => new m.Telegraf(env.TELEGRAM_BOT_TOKEN))
      : null;

  for (const p of pendingNoProof) {
    if (p.paymentProvider === "YOOKASSA" && p.ykPaymentId && env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY) {
      try {
        const payment = await getPayment(env.YOOKASSA_SHOP_ID, env.YOOKASSA_SECRET_KEY, p.ykPaymentId);
        if (payment.status === "succeeded") {
          const paymentRubles = parseFloat(payment.amount?.value ?? "0");
          const purchaseRubles = p.amount ?? 0;
          if (purchaseRubles <= 0 || Math.abs(paymentRubles - purchaseRubles) < 0.01) {
            await activatePurchase(p, bot!.telegram);
            logger.info({ purchaseId: p.id, orderCode: p.orderCode }, "YooKassa pending activated on timeout run");
            continue;
          }
        }
      } catch (e) {
        logger.debug({ err: e, purchaseId: p.id }, "getPayment failed in expirePending, will reject");
      }
    }
    await prisma.purchase.update({
      where: { id: p.id },
      data: { status: "rejected", rejectReason: "timeout_no_proof", reviewedAt: now, reviewedBy: systemReviewer },
    });
    noProofRejected++;
  }
  for (const p of pendingWithProof) {
    await prisma.purchase.update({
      where: { id: p.id },
      data: { status: "rejected", rejectReason: "timeout_no_review", reviewedAt: now, reviewedBy: systemReviewer },
    });
  }
  const total = noProofRejected + pendingWithProof.length;
  if (total > 0) {
    logger.info(
      { countNoProof: noProofRejected, countWithProof: pendingWithProof.length, total },
      "Pending orders timed out"
    );
    const msg =
      "Заявки закрыты по таймауту:\n" +
      (noProofRejected > 0 ? `• пруф не прислан: ${noProofRejected}\n` : "") +
      (pendingWithProof.length > 0 ? `• тренер не подтвердил: ${pendingWithProof.length}` : "");
    try {
      const sendBot = bot ?? (await import("telegraf").then((m) => new m.Telegraf(env.TELEGRAM_BOT_TOKEN)));
      await sendBot!.telegram.sendMessage(Number(env.TRAINER_TELEGRAM_ID), msg);
    } catch (e) {
      logger.warn({ err: e }, "Failed to notify trainer about timeout");
    }
  }
}

async function expireAccess() {
  const now = new Date();
  const expired = await prisma.purchase.findMany({
    where: { status: "active", accessExpiresAt: { lt: now } },
    include: { user: true, tariff: true },
  });
  if (expired.length === 0) return;

  const env = getEnv();
  const bot = await import("telegraf").then((m) => new m.Telegraf(env.TELEGRAM_BOT_TOKEN));
  const selfChatId = await getSelfGroupChatId();

  for (const p of expired) {
    try {
      if (p.tariff.type === "SELF" && selfChatId) {
        try {
          await bot.telegram.banChatMember(selfChatId, Number(p.user.telegramId));
        } catch (e: unknown) {
          if (isIgnorableTgError(e)) {
            logger.debug({ userId: p.userId }, "User already left self chat");
          } else {
            logger.warn({ err: e, userId: p.userId }, "Could not remove from self chat");
          }
        }
      }
      if (p.tariff.type === "INDIVIDUAL" && p.individualChatId) {
        try {
          await bot.telegram.banChatMember(String(p.individualChatId), Number(p.user.telegramId));
        } catch (e: unknown) {
          if (isIgnorableTgError(e)) {
            logger.debug({ userId: p.userId }, "User already left individual chat");
          } else {
            logger.warn({ err: e, userId: p.userId }, "Could not remove from individual chat");
          }
        }
      }
      const expiredDate = p.accessExpiresAt?.toLocaleDateString("ru-RU") ?? "";
      const msgUser = p.tariff.type === "SELF" ? MSG_EXPIRED_SELF : MSG_EXPIRED_INDIVIDUAL;
      await bot.telegram.sendMessage(Number(p.user.telegramId), msgUser);
      const trnMsg = t(TRN_EXPIRED, {
        ORDER_CODE: p.orderCode,
        TARIFF_TITLE: p.tariff.title,
        NAME: p.user.name ?? "—",
        TELEGRAM_ID: String(p.user.telegramId),
      });
      await bot.telegram.sendMessage(Number(env.TRAINER_TELEGRAM_ID), trnMsg);
    } catch (e) {
      if (isIgnorableTgError(e)) {
        logger.debug({ purchaseId: p.id }, "Ignorable error sending expiration notice");
      } else {
        logger.error({ err: e, purchaseId: p.id }, "Failed to process expiration");
      }
    }
    await prisma.purchase.update({
      where: { id: p.id },
      data: { status: "expired" },
    });
  }

  logger.info({ count: expired.length }, "Expired access processed");
}
