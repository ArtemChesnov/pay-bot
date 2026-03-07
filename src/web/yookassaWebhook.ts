/**
 * POST /webhooks/yookassa — HTTP-уведомления ЮKassa.
 * Отвечаем 200 быстро; проверка IP (allowlist) и при необходимости GET /payments/{id}.
 */

import { Router, Request, Response } from "express";
import { getEnv } from "../lib/env.js";
import { getPayment } from "../lib/yookassa.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { activatePurchase } from "../lib/activatePurchase.js";

const router = Router();

export function isAllowedIp(clientIp: string, allowlist: string): boolean {
  if (!allowlist.trim()) return true;
  const ips = allowlist.split(",").map((s) => s.trim()).filter(Boolean);
  return ips.some((ip) => clientIp === ip || clientIp.startsWith(ip));
}

export function yookassaWebhookRouter(
  getTelegram: () => { sendMessage: (chatId: number, text: string) => Promise<unknown> }
): Router {
  router.post("/", async (req: Request, res: Response) => {
    res.status(200).end();

    const env = getEnv();
    const allowlist = env.YOOKASSA_WEBHOOK_IP_ALLOWLIST ?? "";
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "";
    if (allowlist && !isAllowedIp(clientIp, allowlist)) {
      logger.warn({ clientIp, allowlist }, "YooKassa webhook: IP not in allowlist");
      return;
    }

    const body = req.body as { type?: string; event?: string; object?: { id?: string; status?: string; metadata?: { orderCode?: string }; amount?: { value?: string; currency?: string } } };
    const event = body.event ?? body.type;
    const obj = body.object;

    if (!event || !obj?.id) {
      logger.debug({ body }, "YooKassa webhook: missing event or object.id");
      return;
    }

    if (event === "payment.waiting_for_capture") {
      logger.debug({ paymentId: obj.id }, "YooKassa: waiting_for_capture (ignored)");
      return;
    }

    if (event === "payment.succeeded") {
      await handlePaymentSucceeded(obj.id, getTelegram());
      return;
    }

    if (event === "payment.canceled") {
      await handlePaymentCanceled(obj.id);
      return;
    }

    logger.debug({ event, paymentId: obj.id }, "YooKassa webhook: unhandled event");
  });

  return router;
}

async function handlePaymentSucceeded(
  paymentId: string,
  telegram: { sendMessage: (chatId: number, text: string) => Promise<unknown> }
): Promise<void> {
  const env = getEnv();
  if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY) return;

  let purchase = await prisma.purchase.findFirst({
    where: { ykPaymentId: paymentId },
    include: { user: true, tariff: true },
  });

  if (!purchase) {
    try {
      const payment = await getPayment(env.YOOKASSA_SHOP_ID, env.YOOKASSA_SECRET_KEY, paymentId);
      const orderCode = payment.metadata?.orderCode;
      if (orderCode) {
        purchase = await prisma.purchase.findFirst({
          where: { orderCode },
          include: { user: true, tariff: true },
        });
      }
    } catch (e) {
      logger.error({ err: e, paymentId }, "YooKassa: getPayment failed in webhook");
      return;
    }
  }

  if (!purchase) {
    logger.warn({ paymentId }, "YooKassa: purchase not found for payment.succeeded");
    return;
  }

  if (purchase.status !== "pending") {
    logger.debug({ purchaseId: purchase.id, status: purchase.status }, "YooKassa: already processed (idempotent)");
    return;
  }

  try {
    const payment = await getPayment(env.YOOKASSA_SHOP_ID, env.YOOKASSA_SECRET_KEY, paymentId);
    if (payment.status !== "succeeded") {
      logger.debug({ paymentId, status: payment.status }, "YooKassa: payment not succeeded");
      return;
    }
    const paymentRubles = parseFloat(payment.amount?.value ?? "0");
    const purchaseRubles = purchase.amount ?? 0;
    if (purchaseRubles > 0 && Math.abs(paymentRubles - purchaseRubles) >= 0.01) {
      logger.warn({ purchaseId: purchase.id, paymentRubles, purchaseRubles }, "YooKassa: amount mismatch");
      return;
    }
  } catch (e) {
    logger.error({ err: e, paymentId }, "YooKassa: getPayment verify failed");
    return;
  }

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { ykPaymentId: paymentId, ykStatus: "succeeded", ykPaidAt: new Date() },
  });

  const updated = await prisma.purchase.findUnique({
    where: { id: purchase.id },
    include: { user: true, tariff: true },
  });
  if (updated) await activatePurchase(updated, telegram);
}

async function handlePaymentCanceled(paymentId: string): Promise<void> {
  const purchase = await prisma.purchase.findFirst({
    where: { ykPaymentId: paymentId },
    include: { user: true },
  });
  if (!purchase || purchase.status !== "pending") return;

  const now = new Date();
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      status: "rejected",
      rejectReason: "yookassa_canceled",
      reviewedAt: now,
      reviewedBy: BigInt(0),
    },
  });

  try {
    const env = getEnv();
    const bot = await import("telegraf").then((m) => new m.Telegraf(env.TELEGRAM_BOT_TOKEN));
    await bot.telegram.sendMessage(
      Number(purchase.user.telegramId),
      "Платеж отменён или не завершён. Можете создать новую заявку и оплатить снова — выберите тариф в боте."
    );
  } catch (e) {
    logger.warn({ err: e, purchaseId: purchase.id }, "Failed to notify user about canceled payment");
  }
}
