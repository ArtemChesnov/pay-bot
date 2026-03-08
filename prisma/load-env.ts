/**
 * Подгружает .env, при отсутствии DATABASE_URL — из ENV_FILE или /etc/bot.env.
 * Импортируйте первым в скриптах (seed, clear-db и т.д.), чтобы Prisma видел переменные.
 */
import "dotenv/config";
import dotenv from "dotenv";
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: process.env.ENV_FILE || "/etc/bot.env" });
}
