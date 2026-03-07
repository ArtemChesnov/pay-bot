import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

export const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "query" },
    { emit: "stdout", level: "error" },
    { emit: "stdout", level: "warn" },
  ],
});

prisma.$on("query", (e: unknown) => {
  const ev = e as { query?: string; duration?: number };
  logger.debug({ query: ev.query, duration: ev.duration }, "prisma query");
});
