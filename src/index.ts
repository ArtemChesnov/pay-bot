import "dotenv/config";
import { getEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { createBot } from "./bot/index.js";
import { createApp, startWebServer } from "./web/index.js";
import { startCron } from "./cron/expireAccess.js";

let httpServer: import("http").Server | null = null;

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  const done = () => {
    logger.info("Shutdown complete");
    process.exit(0);
  };
  if (httpServer) {
    httpServer.close((err) => {
      if (err) logger.warn({ err }, "Server close error");
      httpServer = null;
      prisma
        .$disconnect()
        .then(done)
        .catch((e) => {
          logger.warn({ err: e }, "Prisma disconnect error");
          done();
        });
    });
  } else {
    prisma.$disconnect().then(done).catch(done);
  }
  const force = setTimeout(() => {
    logger.warn("Forcing exit");
    process.exit(1);
  }, 15000);
  force.unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function main() {
  getEnv();
  const bot = createBot();
  const app = createApp(bot);
  const env = getEnv();

  const allowedUpdates = ["message", "callback_query", "chat_join_request", "my_chat_member"] as const;

  if (env.USE_POLLING) {
    await bot.telegram.deleteWebhook();
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ["message", "callback_query", "chat_join_request", "my_chat_member"],
    });
    logger.info("Bot: polling (локальный запуск, туннель не нужен)");
  } else {
    const baseUrl = env.WEBHOOK_BASE_URL!.replace(/\/$/, "");
    const webhookUrl = `${baseUrl}/webhook`;
    await bot.telegram.setWebhook(webhookUrl, {
      secret_token: env.WEBHOOK_SECRET,
      allowed_updates: [...allowedUpdates],
    });
    logger.info({ webhookUrl }, "Webhook set");
  }

  httpServer = await startWebServer(app);
  startCron();
  logger.info("Pay-bot started");
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal error");
  process.exit(1);
});
