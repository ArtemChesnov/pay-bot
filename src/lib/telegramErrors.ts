/**
 * Централизованная обработка ошибок Telegram API.
 * Нормализация и определение "игнорируемых" ошибок (не падать на массовых операциях).
 */

export function isIgnorableTgError(e: unknown): boolean {
  const msg = normalizeTgErrorMessage(e);
  const ignorable = [
    "user not found",
    "USER_NOT_PARTICIPANT",
    "user is an administrator",
    "user not in the chat",
    "chat not found",
    "CHAT_ADMIN_REQUIRED",
    "have no rights to send a message",
    "blocked by the user",
    "user is deactivated",
    "bot was blocked by the user",
    "message to edit not found",
    "message is not modified",
    "reply message not found",
  ];
  return ignorable.some((s) => msg.toLowerCase().includes(s.toLowerCase()));
}

export function normalizeTgErrorMessage(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "description" in e && typeof (e as { description: unknown }).description === "string") {
    return (e as { description: string }).description;
  }
  if (typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
