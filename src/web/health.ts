import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../lib/env.js";

export const healthRouter = Router();
const HEALTH_DB_TIMEOUT_MS = 5000;

healthRouter.get("/", async (_req: Request, res: Response) => {
  const checks: Record<string, unknown> = {};
  let envOk = true;
  try {
    const env = getEnv();
    checks.trainerId = "set";
    checks.yookassa = !!(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
    checks.policyVersion = env.POLICY_VERSION;
    checks.offerVersion = env.OFFER_VERSION;
    const oneYooKassaSet = !!(env.YOOKASSA_SHOP_ID || env.YOOKASSA_SECRET_KEY);
    if (oneYooKassaSet && !checks.yookassa) envOk = false;
  } catch (e) {
    envOk = false;
    checks.error = String(e);
  }

  let dbOk = true;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("health db timeout")), HEALTH_DB_TIMEOUT_MS)
      ),
    ]);
  } catch {
    dbOk = false;
  }

  const ok = envOk && dbOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    db: dbOk ? "connected" : "disconnected",
    env: checks,
    selfGroupIdOptional: true,
  });
});
