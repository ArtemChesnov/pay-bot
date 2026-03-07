/**
 * Единый копирайт для бота: пользовательские и тренерские сообщения.
 * Плейсхолдеры: {NAME}, {ORDER_CODE}, {EXPIRES_AT}, {POLICY_URL}, {OFFER_URL} и т.д.
 */

export type TextPlaceholders = Record<string, string | number | undefined>;

function replace(template: string, placeholders: TextPlaceholders): string {
  let out = template;
  for (const [key, value] of Object.entries(placeholders)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), String(value ?? ""));
  }
  return out;
}

// —— Приветствие и старт ——
export const MSG_WELCOME =
  "Привет! Это бот курса «РЕЛЬЕФ» 💔\n\n" +
  "Здесь ты сможешь пройти регистрацию, выбрать тариф и оплатить участие. После оплаты я пришлю всё, что нужно для старта.\n\n" +
  "Нажми «Начать» — это займёт всего пару минут.";

export const BTN_START = "✨ Начать";

export const MSG_START_LEGAL =
  "Перед оформлением, пожалуйста, ознакомься с документами:\n\n" +
  "• Политика обработки персональных данных: {POLICY_URL}\n" +
  "• Публичная оферта: {OFFER_URL}\n\n" +
  "Нажимая «Согласен(на) и продолжить», ты подтверждаешь согласие на обработку персональных данных и принимаешь условия оферты.";

export const BTN_CONSENT_AGREE = "✅ Согласен(на) и продолжить";
export const BTN_CONSENT_DECLINE = "↩️ Пока не готов(а)";

export const MSG_START_DECLINED =
  "Понимаю. Без согласия на обработку данных и принятия условий оферты я не смогу оформить доступ.\n\nКогда будешь готов(а), просто нажми «Начать» или команду /start.";

// —— Регистрация ——
export const MSG_ASK_NAME =
  "Давай познакомимся 🙂\nНапиши, пожалуйста, имя, как к тебе можно обращаться.";

export const MSG_NAME_SAVED =
  "Спасибо! Теперь нужен номер телефона для связи по оплате и доступу.";

export const MSG_ASK_PHONE =
  "Поделись, пожалуйста, номером телефона кнопкой ниже.\nОн нужен только для связи по вопросам оплаты, доступа и организационных деталей.";

export const MSG_PHONE_SAVED =
  "Отлично, всё готово ✅\nТеперь можно выбрать тариф.";

// —— Тарифы и оплата ——
export const MSG_TARIFF_PICK =
  "Выбери подходящий формат участия в курсе «РЕЛЬЕФ» 💔\n\n" +
  "🟢 Самостоятельный — 28 дней интенсивных тренировок, 28 дней блока «здоровье», чат поддержки и доступ к материалам на 3 месяца.\n\n" +
  "🔵 Индивидуальный — всё из самостоятельного тарифа + диагностика постуры и движения, 4 онлайн-тренировки «здоровье», личный чат с Викторией в течение 2 месяцев и доступ к материалам на 5 месяцев.";

export const MSG_TARIFF_UNAVAILABLE =
  "Тариф временно недоступен. Попробуй позже или напиши в поддержку.";

export const MSG_REGISTER_FIRST =
  "Чтобы выбрать тариф и оплатить, нужно сначала пройти короткую регистрацию.\nНажми «Начать» или /start.";

export const MSG_YOOKASSA_PAY =
  "Курс: «РЕЛЬЕФ»\n" +
  "Тариф: {TARIFF_TITLE}\n" +
  "Стоимость: {PRICE} ₽\n" +
  "Код заказа: {ORDER_CODE}\n\n" +
  "После оплаты ты получишь доступ в соответствии с выбранным тарифом. Нажми «Оплатить», чтобы перейти к оплате.";

export const MSG_EXISTING_PENDING =
  "По этому тарифу у тебя уже есть незавершённая заявка.\nМожно оплатить её по текущей ссылке или создать новую.";

export const MSG_NEW_ORDER_CREATED =
  "Новая заявка готова ✅\nНиже отправляю актуальную ссылку на оплату.";

export const MSG_OLD_PENDING_CREATE_NEW =
  "У тебя есть старая заявка по этому тарифу. Оплата только по ссылке — можно создать новую заявку кнопкой ниже.";

export const MSG_PAYMENT_CREATE_FAILED =
  "Не удалось создать платёж. Попробуй позже или выбери другой тариф.";

export const MSG_PAYMENT_REPLACE_FAILED =
  "Не удалось создать платёж для новой заявки. Попробуй позже.";

// —— Проверка оплаты ——
export const MSG_PAYMENT_NOT_FOUND =
  "Сейчас у тебя нет активной заявки на оплату.\nНажми /start, выбери тариф — и я сразу подготовлю ссылку.";

export const MSG_PAYMENT_CHECK_PENDING =
  "Платёж ещё не подтверждён.\nЕсли ты уже оплатил(а), подожди немного и нажми «Проверить оплату» ещё раз.";

export const MSG_PAYMENT_CHECK_CANCELED =
  "Похоже, этот платёж был отменён.\nМожно вернуться к оплате по ссылке выше или создать новую заявку.";

export const MSG_PAYMENT_CHECK_SUCCESS =
  "Оплата подтверждена ✅\n\n" +
  "Участие в курсе «РЕЛЬЕФ» оформлено. Доступ будет предоставлен по правилам выбранного тарифа: в общий чат автоматически или через организацию личного чата с Викторией.";

export const MSG_PAYMENT_CHECK_UNAVAILABLE =
  "Сейчас не получается проверить статус платежа автоматически.\nПопробуй ещё раз чуть позже.";

export const MSG_PAYMENT_AMOUNT_MISMATCH =
  "Я получил информацию о платеже, но сумма не совпала с заказом.\nНапиши, пожалуйста, в поддержку — поможем проверить вручную.";

export const MSG_PAYMENT_ORDER_NOT_FOUND =
  "Эту заявку уже обработали или она не найдена.\nНажми /start и выбери тариф заново, если нужно оформить доступ.";

export const MSG_YOOKASSA_USE_BUTTONS =
  "Оплата по этой заявке — по ссылке. Нажми «Оплатить» в сообщении выше или «Проверить оплату» после оплаты.";

export const MSG_MANUAL_DISABLED =
  "Сейчас приём только по ссылке. Создай новый заказ: /start — выбери тариф и оплати по кнопке.";

// —— Поддержка / пересылка тренеру ——
export const MSG_SUPPORT_SENT = "Готово ✅ Сообщение отправлено тренеру.";

export const MSG_SUPPORT_UNSUPPORTED =
  "Я могу передать тренеру текст, фото, видео, голосовое сообщение или документ. Попробуй отправить один из этих форматов.";

export const MSG_FORWARD_FAIL =
  "Не получилось отправить сообщение с первого раза из-за временной ошибки.\nПопробуй ещё раз через минуту.";

export const MSG_FORWARD_FAIL_TRAINER = "Не удалось отправить.";

// —— Fallback ——
export const MSG_FALLBACK_START =
  "Я помогу оформить доступ к курсу.\nНажми «Начать», чтобы перейти к регистрации и оплате.";

// —— После оплаты (активация) ——
export const MSG_CONFIRMED_SELF_GROUP_READY =
  "Оплата подтверждена ✅\n" +
  "Доступ активирован до {EXPIRES_AT}.\n\n" +
  "Вот ссылка для входа в общий чат (действует ограниченное время):";

export const MSG_CONFIRMED_SELF_GROUP_NOT_READY =
  "Оплата подтверждена ✅\n" +
  "Доступ активирован до {EXPIRES_AT}.\n" +
  "Общий учебный чат ещё настраивается — я пришлю ссылку сразу, как тренер завершит настройку.";

export const MSG_CONFIRMED_INDIVIDUAL =
  "Оплата подтверждена ✅\n" +
  "Доступ активирован до {EXPIRES_AT}.\n\n" +
  "Пиши сюда любые вопросы по курсу — я передам тренеру, и он ответит в этой переписке.";

export const MSG_CONFIRMED_INDIVIDUAL_DM =
  "Оплата подтверждена ✅\n" +
  "Доступ активирован до {EXPIRES_AT}.\n\n" +
  "Ваш тренер: {TRAINER_USERNAME}\nОн напишет вам. Если у вас закрыты личные сообщения — напишите ему первым.";

export const MSG_CONFIRMED_INDIVIDUAL_DM_NO_USERNAME =
  "Оплата подтверждена ✅\n" +
  "Доступ активирован до {EXPIRES_AT}.\n\n" +
  "Тренер свяжется с вами сам. Если личные сообщения закрыты — откройте настройки приватности в Telegram.";

export const MSG_CONFIRMED_INDIVIDUAL_GROUP_PENDING =
  "Оплата подтверждена ✅\nТренер создаёт ваш личный чат. Я пришлю ссылку, как только он будет готов.";

export const MSG_CONFIRMED_INDIVIDUAL_GROUP_READY =
  "Оплата подтверждена ✅\nДоступ активирован до {EXPIRES_AT}.\n\nВот ссылка для входа в личный чат с тренером (действует ограниченное время):";

export const MSG_REJECTED =
  "Похоже, оплату не удалось подтвердить ❌\n" +
  "Если ты оплатил(а), пришли, пожалуйста, другое подтверждение (скрин/чек) или уточни детали (сумма, время, последние 4 цифры).";

export const MSG_EXPIRED_SELF =
  "Срок доступа завершён.\nЕсли хочешь продлить участие — начни заново: /start";

export const MSG_EXPIRED_INDIVIDUAL =
  "Срок индивидуального сопровождения завершён.\nЕсли хочешь продлить доступ — начни заново: /start";

export const MSG_INDIVIDUAL_BLOCKED =
  "Сейчас у тебя нет активного индивидуального доступа.\nЧтобы оформить — нажми /start.";

export const MSG_INDIVIDUAL_WRITE_TO_TRAINER =
  "По индивидуальному тарифу вы общаетесь с тренером напрямую. {TRAINER_USERNAME}Ссылка: {TRAINER_LINK}";

export const MSG_PROOF_REQUEST =
  "Пришли подтверждение оплаты:\n\n" +
  "• лучше всего — скрин/чек перевода (фото/файл)\n" +
  "• если без скрина — сообщением: сумма + время + последние 4 цифры карты/счёта отправителя.";

export const MSG_PROOF_RECEIVED =
  "Спасибо! Заявка передана тренеру на подтверждение ✅\nОбычно это занимает немного времени. Я напишу, как только оплата будет подтверждена.";

export const MSG_INVITE_COOLDOWN =
  "Ссылка уже отправлена недавно. Подождите {MINUTES} мин. или используйте предыдущее сообщение со ссылкой.";

// —— Тренер (утилитарный стиль допустим) ——
export const TRN_NEW_CONFIRM_REQUEST =
  "🧾 Заявка на подтверждение оплаты\n" +
  "Тариф: {TARIFF_TITLE}\nСумма: {PRICE} ₽\nКод: {ORDER_CODE}\n\n" +
  "Пользователь: {NAME}\nТелефон: {PHONE}\nTelegram: @{USERNAME} / id={TELEGRAM_ID}\n\nПруф: (см. ниже / вложение)";

export const TRN_CONFIRMED =
  "✅ Оплата подтверждена: {ORDER_CODE}\n" +
  "Тариф: {TARIFF_TITLE}\nДоступ до: {EXPIRES_AT}\n" +
  "Пользователь: {NAME} / {PHONE} / id={TELEGRAM_ID}";

export const TRN_REJECTED =
  "❌ Отклонено: {ORDER_CODE}\nПричина: {REJECT_REASON}\nПользователь: {NAME} / id={TELEGRAM_ID}";

export const TRN_YOOKASSA_PAID =
  "💳 Оплата через ЮKassa: {YK_PAYMENT_ID}\nЗаказ: {ORDER_CODE}\nНапоминание: при статусе самозанятого чек формируется в «Мой налог» и должен быть отправлен покупателю.";

export const TRN_EXPIRED =
  "⏳ Доступ истёк: {ORDER_CODE}\nТариф: {TARIFF_TITLE}\nПользователь: {NAME} / id={TELEGRAM_ID}";

export const TRN_BIND_OK =
  "✅ Общий чат привязан.\nОжидают доступа: {PENDING_COUNT}. Выдать сейчас?";

export const TRN_INDIVIDUAL_NEW_STUDENT =
  "👤 Новый ученик (индивидуальный тариф)\n" +
  "Заказ: {ORDER_CODE}\nДоступ до: {EXPIRES_AT}\n" +
  "Имя: {NAME}\nТелефон: {PHONE}\nTelegram: {USERNAME} / id={TELEGRAM_ID}\n\nСсылки: {USER_LINK} {USERNAME_LINK}";

export const TRN_INDIVIDUAL_CREATE_GROUP_INSTRUCTION =
  "📌 Индивидуальный тариф: создайте личный чат\n\n" +
  "Создайте группу «Индивидуальный — {NAME} — {ORDER_CODE}», добавьте бота администратором и напишите в группе:\n" +
  "/bind_individual_chat {ORDER_CODE}\n\nУченик: {USER_LINK} {USERNAME} Телефон: {PHONE}";

export const TRN_INDIVIDUAL_BOUND_OK =
  "✅ Личный чат привязан, инвайт отправлен ученику.";

export const TRN_BOT_NOT_ADMIN =
  "Сделайте бота админом с правом приглашать пользователей / управлять ссылками.";

export const TRN_COMMAND_TRAINER_ONLY =
  "Эта команда доступна только тренеру.";

// —— Кнопки ——
export const BTN_SHARE_CONTACT = "📞 Поделиться контактом";
export const BTN_TARIFF_SELF = "🟢 Самостоятельный (3 месяца)";
export const BTN_TARIFF_INDIVIDUAL = "🔵 Индивидуальный (5 месяцев)";
export const BTN_PAID = "✅ Я оплатил(а)";
export const BTN_OTHER_TARIFF = "↩️ Выбрать другой тариф";
export const BTN_CONFIRM = "✅ Подтвердить";
export const BTN_REJECT = "❌ Отклонить";
export const BTN_GRANT_ACCESS = "✅ Выдать доступ";
export const BTN_CREATE_NEW_ORDER = "Создать новую заявку";
export const BTN_PAY_YOOKASSA = "💳 Оплатить";
export const BTN_CHECK_PAYMENT = "🔄 Проверить оплату";

export function t(template: string, placeholders: TextPlaceholders = {}): string {
  return replace(template, placeholders);
}
