import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default("3000"),
  USE_POLLING: z.string().transform((s) => s === "true" || s === "1").default("false"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  WEBHOOK_SECRET: z.string().min(1, "WEBHOOK_SECRET is required"),
  WEBHOOK_BASE_URL: z.string().url("WEBHOOK_BASE_URL must be a valid URL").optional().or(z.literal("")),
  TRAINER_TELEGRAM_ID: z.string().transform((s) => BigInt(s)),
  POLICY_VERSION: z.string().default("1.0"),
  OFFER_VERSION: z.string().default("1.0"),
  CARD_NUMBER: z.string().optional(),
  SBP_PHONE: z.string().optional(),
  CRON_TZ: z.string().default("Europe/Moscow"),
  INVITE_COOLDOWN_MINUTES: z.string().transform(Number).default("15"),
  PENDING_TIMEOUT_HOURS: z.string().transform(Number).default("48"),
  REVIEW_TIMEOUT_DAYS: z.string().transform(Number).default("7"),
  SELF_GROUP_ID: z.string().optional(),
  INDIVIDUAL_MODE: z.enum(["DM", "MANUAL_GROUP"]).default("MANUAL_GROUP"),
  TRAINER_USERNAME: z.string().optional(),
  INDIVIDUAL_INVITE_EXPIRE_MINUTES: z.string().transform(Number).default("10"),
  EXECUTOR_FIO: z.string().optional(),
  EXECUTOR_INN: z.string().optional(),
  EXECUTOR_CONTACTS: z.string().optional(),
  EXECUTOR_EMAIL: z.string().optional(),
  EXECUTOR_PHONE: z.string().optional(),
  EXECUTOR_CITY: z.string().optional(),
  EXECUTOR_STATUS: z.string().optional(),
  POLICY_DATE_PUBLISHED: z.string().optional(),
  POLICY_EDITION_DATE: z.string().optional(),
  OFFER_DATE_PUBLISHED: z.string().optional(),
  OFFER_EDITION_DATE: z.string().optional(),
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  YOOKASSA_RETURN_URL: z.string().url().optional().or(z.literal("")),
  YOOKASSA_WEBHOOK_PATH: z.string().default("/webhooks/yookassa"),
  YOOKASSA_WEBHOOK_IP_ALLOWLIST: z.string().optional(),
  YOOKASSA_TEST_MODE: z.string().optional(),
})
  .refine(
    (data) =>
      !!(data.YOOKASSA_SHOP_ID && data.YOOKASSA_SECRET_KEY) ||
      (!data.YOOKASSA_SHOP_ID && !data.YOOKASSA_SECRET_KEY),
    {
      message:
        "Укажите оба YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY для приёма оплаты или оставьте оба пустыми (тарифы будут недоступны)",
      path: ["YOOKASSA_SHOP_ID"],
    }
  )
  .refine(
    (data) => data.USE_POLLING || (!!data.WEBHOOK_BASE_URL && data.WEBHOOK_BASE_URL !== ""),
    { message: "При USE_POLLING=false укажите WEBHOOK_BASE_URL", path: ["WEBHOOK_BASE_URL"] }
  );

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}
