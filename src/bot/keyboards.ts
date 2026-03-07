import { Markup } from "telegraf";
import { BTN_START, BTN_CONSENT_AGREE, BTN_CONSENT_DECLINE, BTN_SHARE_CONTACT, BTN_TARIFF_SELF, BTN_TARIFF_INDIVIDUAL, BTN_PAID, BTN_CONFIRM, BTN_REJECT, BTN_CREATE_NEW_ORDER, BTN_PAY_YOOKASSA, BTN_CHECK_PAYMENT } from "./texts.js";

const START_BUTTON = "start_button";
const POLICY_OFFER_CONSENT = "consent_agree";
const CONSENT_DECLINE = "consent_decline";
const TARIFF_SELF = "tariff_self";
const TARIFF_INDIVIDUAL = "tariff_individual";
const PAYMENT_DONE = "payment_done";
const CONFIRM_PREFIX = "confirm_";
const REJECT_PREFIX = "reject_";
const GRANT_PENDING_SELF = "grant_pending_self";
const REPLACE_PENDING_PREFIX = "replace_pending_";
const CHECK_PAYMENT_PREFIX = "check_payment_";

/**
 * Inline-кнопка «✨ Начать» под приветствием (промо или fallback).
 * По нажатию показывается юридический экран: политика, оферта, кнопки согласия.
 * @returns {ReturnType<Markup["inlineKeyboard"]>} Inline-клавиатура с одной кнопкой
 */
export function startKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback(BTN_START, START_BUTTON)]]);
}

/**
 * Клавиатура согласия: «Согласен(на) и продолжить» и «Пока не готов(а)».
 * @returns {ReturnType<Markup["inlineKeyboard"]>} Inline-клавиатура
 */
export function consentKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(BTN_CONSENT_AGREE, POLICY_OFFER_CONSENT)],
    [Markup.button.callback(BTN_CONSENT_DECLINE, CONSENT_DECLINE)],
  ]);
}

/**
 * Reply-клавиатура с кнопкой «Поделиться контактом» для запроса телефона.
 * @returns {ReturnType<Markup["keyboard"]>} Клавиатура с одной кнопкой
 */
export function requestContactKeyboard() {
  return Markup.keyboard([ [ Markup.button.contactRequest(BTN_SHARE_CONTACT) ]   ]).resize();
}

/**
 * Inline-выбор тарифа: Самостоятельный и Индивидуальный.
 * @returns {ReturnType<Markup["inlineKeyboard"]>} Inline-клавиатура
 */
export function tariffKeyboard() {
  return Markup.inlineKeyboard([
    [ Markup.button.callback(BTN_TARIFF_SELF, TARIFF_SELF) ],
    [ Markup.button.callback(BTN_TARIFF_INDIVIDUAL, TARIFF_INDIVIDUAL) ],
  ]);
}

/**
 * Клавиатура «Я оплатил(а)» для ручной оплаты.
 * @returns {ReturnType<Markup["inlineKeyboard"]>} Inline-клавиатура
 */
export function paymentDoneKeyboard() {
  return Markup.inlineKeyboard([ [ Markup.button.callback(BTN_PAID, PAYMENT_DONE) ] ]);
}

/**
 * Клавиатура «у вас уже есть заявка» + кнопка создать новую.
 * При нажатии старая pending-заявка помечается rejected (replaced).
 * @param {string} purchaseId - ID заявки для callback replace_pending
 * @returns {ReturnType<Markup["inlineKeyboard"]>} Inline-клавиатура
 */
export function existingPendingKeyboard(purchaseId: string) {
  return Markup.inlineKeyboard([
    [ Markup.button.callback(BTN_CREATE_NEW_ORDER, REPLACE_PENDING_PREFIX + purchaseId) ],
  ]);
}

/**
 * ЮKassa: кнопка «Оплатить» (url) + «Проверить оплату» (callback).
 * Используется и для демо-оплаты с локальной ссылкой.
 * @param {string} confirmationUrl - URL страницы оплаты ЮKassa
 * @param {string} purchaseId - ID заявки для callback check_payment
 * @returns {ReturnType<Markup["inlineKeyboard"]>} Inline-клавиатура
 */
export function yookassaPayKeyboard(confirmationUrl: string, purchaseId: string) {
  return Markup.inlineKeyboard([
    [ Markup.button.url(BTN_PAY_YOOKASSA, confirmationUrl) ],
    [ Markup.button.callback(BTN_CHECK_PAYMENT, CHECK_PAYMENT_PREFIX + purchaseId) ],
  ]);
}

/**
 * ЮKassa: только «Проверить оплату» (если confirmationUrl ещё не получен).
 * @param {string} purchaseId - ID заявки для callback check_payment
 * @returns {ReturnType<Markup["inlineKeyboard"]>} Inline-клавиатура
 */
export function yookassaCheckOnlyKeyboard(purchaseId: string) {
  return Markup.inlineKeyboard([
    [ Markup.button.callback(BTN_CHECK_PAYMENT, CHECK_PAYMENT_PREFIX + purchaseId) ],
  ]);
}

/**
 * Клавиатура тренера: «Подтвердить» и «Отклонить» для заявки.
 * @param {string} purchaseId - ID заявки для callback confirm_/reject_
 * @returns {ReturnType<Markup["inlineKeyboard"]>} Inline-клавиатура
 */
export function trainerConfirmRejectKeyboard(purchaseId: string) {
  return Markup.inlineKeyboard([
    [ Markup.button.callback(BTN_CONFIRM, CONFIRM_PREFIX + purchaseId) ],
    [ Markup.button.callback(BTN_REJECT, REJECT_PREFIX + purchaseId) ],
  ]);
}

export const CALLBACK = {
  START_BUTTON,
  POLICY_OFFER_CONSENT,
  CONSENT_DECLINE,
  TARIFF_SELF,
  TARIFF_INDIVIDUAL,
  PAYMENT_DONE,
  CONFIRM_PREFIX,
  REJECT_PREFIX,
  GRANT_PENDING_SELF,
  REPLACE_PENDING_PREFIX,
  CHECK_PAYMENT_PREFIX,
} as const;
