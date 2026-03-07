import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Telegraf } from "telegraf";
import type { BotContext } from "../bot/middleware.js";
import { handleError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { policyPage, offerPage, yookassaReturnPage } from "./pages.js";
import { healthRouter } from "./health.js";
import { yookassaWebhookRouter } from "./yookassaWebhook.js";
import { getEnv } from "../lib/env.js";

/**
 * Создаёт Express-приложение: policy, offer, yookassa/return, webhook.
 * @param {Telegraf<BotContext>} bot - Экземпляр бота для webhook
 * @returns {express.Express} Настроенное приложение
 */
export function createApp(bot: Telegraf<BotContext>) {
  const app = express();
  const env = getEnv();

  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json());

  app.use(
    "/webhook",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      message: { error: "Too many requests" },
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/health", healthRouter);
  app.get("/policy", (_req, res) => {
    const executor =
      env.EXECUTOR_FIO || env.EXECUTOR_INN
        ? {
            fio: env.EXECUTOR_FIO ?? "",
            inn: env.EXECUTOR_INN ?? "",
            email: env.EXECUTOR_EMAIL ?? "",
            phone: env.EXECUTOR_PHONE ?? "",
            city: env.EXECUTOR_CITY ?? "",
            status: env.EXECUTOR_STATUS ?? "",
          }
        : null;
    const dates = {
      datePublished: env.POLICY_DATE_PUBLISHED,
      dateEdition: env.POLICY_EDITION_DATE ?? env.POLICY_VERSION,
    };
    res.type("html").send(policyPage(env.POLICY_VERSION, executor, dates));
  });
  app.get("/offer", (_req, res) => {
    const executor =
      env.EXECUTOR_FIO || env.EXECUTOR_INN
        ? {
            fio: env.EXECUTOR_FIO ?? "",
            inn: env.EXECUTOR_INN ?? "",
            email: env.EXECUTOR_EMAIL ?? "",
            phone: env.EXECUTOR_PHONE ?? "",
            city: env.EXECUTOR_CITY ?? "",
            status: env.EXECUTOR_STATUS ?? "",
          }
        : null;
    const dates = {
      datePublished: env.OFFER_DATE_PUBLISHED,
      dateEdition: env.OFFER_EDITION_DATE ?? env.OFFER_VERSION,
    };
    res.type("html").send(offerPage(env.OFFER_VERSION, executor, dates));
  });

  app.get("/yookassa/return", (_req, res) => res.type("html").send(yookassaReturnPage()));

  if (env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY) {
    app.use(env.YOOKASSA_WEBHOOK_PATH, yookassaWebhookRouter(() => bot.telegram));
  }

  app.post("/webhook", (req, res, next) => {
    const secret = req.headers["x-telegram-bot-api-secret-token"];
    if (secret !== env.WEBHOOK_SECRET) {
      logger.warn("Webhook: 401 (неверный или отсутствующий secret_token)");
      return res.status(401).end();
    }
    const update = req.body as { message?: unknown; callback_query?: unknown };
    logger.info(
      { hasMessage: !!update?.message, hasCallbackQuery: !!update?.callback_query },
      "Webhook: получен update"
    );
    next();
  }, bot.webhookCallback("/webhook"));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const { message, statusCode } = handleError(err);
    res.status(statusCode).json({ error: message });
  });

  return app;
}

/**
 * Запускает HTTP-сервер на порту из env.PORT.
 * @param {express.Express} app - Express-приложение
 * @returns {Promise<import("http").Server>} Сервер
 */
export function startWebServer(app: express.Express): Promise<import("http").Server> {
  const env = getEnv();
  return new Promise((resolve) => {
    const server = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "Web server listening");
      resolve(server);
    });
  });
}
