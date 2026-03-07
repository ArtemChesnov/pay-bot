import type { BotContext } from "../middleware.js";
import { prisma } from "../../lib/prisma.js";
import { getEnv } from "../../lib/env.js";
import type { Prisma } from "@prisma/client";

/** В экспорте: 0 (система) → "system", иначе строкой telegramId тренера */
function formatReviewedBy(reviewedBy: bigint | null): string {
  if (reviewedBy == null) return "";
  if (reviewedBy === BigInt(0)) return "system";
  return String(reviewedBy);
}

export async function handleWhoami(ctx: BotContext) {
  const chat = ctx.chat;
  const from = ctx.from;
  if (!chat || !from || BigInt(from.id) !== getEnv().TRAINER_TELEGRAM_ID) return;
  const text = `chat_id: ${chat.id}\nuser_id: ${from.id}\nusername: @${from.username ?? "—"}`;
  return ctx.reply(text);
}

export async function handleExportPurchases(ctx: BotContext) {
  const from = ctx.from;
  if (!from || BigInt(from.id) !== getEnv().TRAINER_TELEGRAM_ID) return;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text ?? "" : "";
  const parts = text.trim().split(/\s+/).slice(1).map((p) => p.toLowerCase());
  const isFormat = (s: string) => s === "json" || s === "csv";
  const isFilter = (s: string) => ["all", "active", "expired", "self", "individual"].includes(s);
  const format: "json" | "csv" = isFormat(parts[0] ?? "") ? parts[0] as "json" | "csv" : "json";
  const filterVal = isFormat(parts[0] ?? "") ? (isFilter(parts[1] ?? "") ? parts[1]! : "all") : (isFilter(parts[0] ?? "") ? parts[0]! : "all");

  const where: Prisma.PurchaseWhereInput = {};
  if (filterVal === "active") {
    where.status = "active";
    where.accessExpiresAt = { gt: new Date() };
  } else if (filterVal === "expired") {
    where.status = "expired";
  } else if (filterVal === "self") {
    where.tariff = { type: "SELF" };
  } else if (filterVal === "individual") {
    where.tariff = { type: "INDIVIDUAL" };
  }

  const purchases = await prisma.purchase.findMany({
    where,
    include: { user: true, tariff: true },
    orderBy: { createdAt: "desc" },
  });

  const rows = purchases.map((p) => ({
    id: p.id,
    orderCode: p.orderCode,
    status: p.status,
    paymentProvider: p.paymentProvider ?? "",
    amount: p.amount ?? null,
    currency: p.currency,
    ykPaymentId: p.ykPaymentId ?? "",
    ykStatus: p.ykStatus ?? "",
    userName: p.user.name,
    userPhone: p.user.phone,
    userTelegramId: String(p.user.telegramId),
    tariff: p.tariff.title,
    durationDays: p.tariff.durationDays,
    accessExpiresAt: p.accessExpiresAt?.toISOString() ?? "",
    reviewedAt: p.reviewedAt?.toISOString() ?? "",
    reviewedBy: formatReviewedBy(p.reviewedBy),
    rejectReason: p.rejectReason ?? "",
    proofType: p.proofType ?? "",
    proofText: p.proofText ?? "",
    proofFileId: p.proofFileId ?? "",
    inviteSentAt: p.inviteSentAt?.toISOString() ?? "",
    createdAt: p.createdAt.toISOString(),
  }));

  const date = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const header = "id;orderCode;status;paymentProvider;amount;currency;ykPaymentId;ykStatus;userName;userPhone;userTelegramId;tariff;durationDays;accessExpiresAt;reviewedAt;reviewedBy;rejectReason;proofType;createdAt";
    const escape = (v: string) => (v.includes(";") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
    const line = (r: (typeof rows)[0]) =>
      [r.id, r.orderCode, r.status, r.paymentProvider, r.amount ?? "", r.currency, r.ykPaymentId, r.ykStatus, r.userName ?? "", r.userPhone ?? "", r.userTelegramId, r.tariff, r.durationDays, r.accessExpiresAt, r.reviewedAt, r.reviewedBy, r.rejectReason ?? "", r.proofType, r.createdAt].map((x) => escape(String(x))).join(";");
    const lines = [header, ...rows.map(line)];
    const csvContent = lines.join("\r\n");
    const BOM = "\uFEFF";
    const buf = Buffer.from(BOM + csvContent, "utf-8");
    return ctx.replyWithDocument(
      { source: buf, filename: `purchases_${date}_${filterVal}.csv` },
      { caption: `Выгрузка покупок CSV (${filterVal}), ${rows.length} записей` }
    );
  }
  const json = JSON.stringify(rows, null, 2);
  const buf = Buffer.from(json, "utf-8");
  return ctx.replyWithDocument(
    { source: buf, filename: `purchases_${date}_${filterVal}.json` },
    { caption: `Выгрузка покупок JSON (${filterVal}), ${rows.length} записей` }
  );
}
