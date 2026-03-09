import { logger } from "./logger.js";

export type AnalyticsEventName =
  | "bot_start_opened"
  | "legal_screen_shown"
  | "legal_accepted"
  | "legal_declined"
  | "registration_name_saved"
  | "registration_phone_saved"
  | "tariff_selected"
  | "payment_link_sent"
  | "payment_check_clicked"
  | "payment_check_pending"
  | "payment_check_canceled"
  | "payment_confirmed"
  | "payment_already_active"
  | "self_access_activated"
  | "individual_access_pending"
  | "individual_access_activated"
  | "payment_not_found_shown"
  | "access_expired_self"
  | "access_expired_individual"
  | "support_message_sent";

export type AnalyticsCommonFields = {
  userId?: string;
  purchaseId?: string;
  orderCode?: string;
  tariffType?: string;
  source?: string;
};

/**
 * Логирует продуктовые события бота в общий pino-логгер.
 * Используется только для аналитики, не влияет на бизнес-логику.
 * @param {AnalyticsEventName} event - Название события (фиксированный список)
 * @param {AnalyticsCommonFields & Record<string, unknown>} [fields] - Дополнительные поля контекста
 * @returns {void}
 */
export function logAnalyticsEvent(
  event: AnalyticsEventName,
  fields: AnalyticsCommonFields & Record<string, unknown> = {}
): void {
  logger.info(
    {
      event,
      ...fields,
    },
    "analytics_event"
  );
}

