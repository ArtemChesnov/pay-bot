import { logger } from "./logger.js";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "APP_ERROR",
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function handleError(err: unknown): { message: string; statusCode: number } {
  if (err instanceof AppError) {
    logger.warn({ code: err.code, message: err.message });
    return { message: err.message, statusCode: err.statusCode };
  }
  logger.error({ err }, "Unhandled error");
  return {
    message: "Internal server error",
    statusCode: 500,
  };
}
