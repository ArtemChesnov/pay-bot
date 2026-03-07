/**
 * YooKassa API v3 client.
 * Base URL: https://api.yookassa.ru/v3/
 * Auth: Basic (shopId:secretKey).
 * Idempotence: header Idempotence-Key (UUID v4), stored 24h.
 */

const YOOKASSA_API = "https://api.yookassa.ru/v3";

export type YooKassaCreatePaymentParams = {
  amount: number; // in rubles (integer cents or rubles - YooKassa expects string "X.00")
  currency?: string;
  orderCode: string;
  tariffTitle: string;
  userTelegramId: string;
  tariffType: string;
  returnUrl: string;
  idempotenceKey: string;
};

/** Собирает тело запроса для POST /payments (для тестов и вызова). */
export function buildCreatePaymentBody(params: YooKassaCreatePaymentParams): Record<string, unknown> {
  if (params.amount <= 0) {
    throw new Error(`YooKassa amount must be positive (got ${params.amount})`);
  }
  const valueStr = Number.isInteger(params.amount) ? `${params.amount}.00` : params.amount.toFixed(2);
  return {
    amount: {
      value: valueStr,
      currency: params.currency ?? "RUB",
    },
    capture: true,
    confirmation: {
      type: "redirect",
      return_url: params.returnUrl,
    },
    description: `Курс: ${params.tariffTitle} | orderCode=${params.orderCode}`,
    metadata: {
      orderCode: params.orderCode,
      userTelegramId: params.userTelegramId,
      tariffType: params.tariffType,
    },
  };
}

export type YooKassaPayment = {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  metadata?: { orderCode?: string; userTelegramId?: string; tariffType?: string };
  confirmation?: { type: string; confirmation_url?: string };
  paid?: boolean;
  created_at?: string;
};

function basicAuth(shopId: string, secretKey: string): string {
  return Buffer.from(`${shopId}:${secretKey}`, "utf-8").toString("base64");
}

export async function createPayment(
  shopId: string,
  secretKey: string,
  params: YooKassaCreatePaymentParams
): Promise<{ id: string; status: string; confirmationUrl: string | null }> {
  const body = buildCreatePaymentBody(params);
  const res = await fetch(`${YOOKASSA_API}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth(shopId, secretKey)}`,
      "Idempotence-Key": params.idempotenceKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`YooKassa createPayment failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as YooKassaPayment;
  const confirmationUrl =
    data.confirmation?.type === "redirect" ? data.confirmation.confirmation_url ?? null : null;
  return {
    id: data.id,
    status: data.status,
    confirmationUrl,
  };
}

export async function getPayment(
  shopId: string,
  secretKey: string,
  paymentId: string
): Promise<YooKassaPayment> {
  const res = await fetch(`${YOOKASSA_API}/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${basicAuth(shopId, secretKey)}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`YooKassa getPayment failed: ${res.status} ${errText}`);
  }

  return (await res.json()) as YooKassaPayment;
}
