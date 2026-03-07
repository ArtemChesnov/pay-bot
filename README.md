# Pay-bot — Telegram-бот продажи курса

Production-ready бот для продажи курса с поддержкой **ЮKassa** (автооплата по ссылке) и запасным вариантом ручной оплаты по реквизитам с подтверждением тренером. Тарифы: SELF (общий чат), INDIVIDUAL (переписка через бота).

## Стек

- Node.js 18+, TypeScript
- Express (webhook, страницы /policy, /offer, /health)
- Telegraf (webhook mode)
- Prisma + PostgreSQL
- node-cron (ежедневная проверка истечения доступа)
- Zod (валидация env), Pino (логи), централизованные ошибки

## Дерево проекта

```
pay-bot/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── index.ts
│   ├── lib/
│   │   ├── env.ts
│   │   ├── errors.ts
│   │   ├── logger.ts
│   │   └── prisma.ts
│   ├── web/
│   │   ├── index.ts
│   │   ├── health.ts
│   │   └── pages.ts
│   ├── bot/
│   │   ├── index.ts
│   │   ├── middleware.ts
│   │   ├── keyboards.ts
│   │   ├── services.ts
│   │   └── handlers/
│   │       ├── start.ts
│   │       ├── consent.ts
│   │       ├── userData.ts
│   │       ├── tariff.ts
│   │       ├── payment.ts
│   │       ├── trainer.ts
│   │       ├── support.ts
│   │       └── admin.ts
│   └── cron/
│       └── expireAccess.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Установка на Ubuntu 22.04 (VPS)

### 1. Система и Node.js

```bash
sudo apt update && sudo apt install -y nodejs npm postgresql-client
# или Node 20 LTS через nodesource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. PostgreSQL

```bash
sudo -u postgres createuser -P paybot
sudo -u postgres createdb -O paybot pay_bot
# DATABASE_URL=postgresql://paybot:YOUR_PASSWORD@localhost:5432/pay_bot
```

### 3. Репозиторий и зависимости

```bash
cd /opt  # или ваш каталог
git clone <repo> pay-bot && cd pay-bot
npm ci
cp .env.example .env
# отредактируйте .env
```

### 4. Переменные окружения (.env)

- `DATABASE_URL` — строка подключения PostgreSQL
- `TELEGRAM_BOT_TOKEN` — токен от @BotFather
- `WEBHOOK_SECRET` — произвольная строка (секрет для заголовка `X-Telegram-Bot-Api-Secret-Token`)
- `WEBHOOK_BASE_URL` — публичный URL приложения, например `https://yourdomain.com`
- `TRAINER_TELEGRAM_ID` — числовой Telegram ID тренера (админ)
- `POLICY_VERSION`, `OFFER_VERSION` — версии документов (подставляются в страницы и в логику согласия)
- `CARD_NUMBER` и/или `SBP_PHONE` — реквизиты для ручной оплаты (обязательны, если не используется ЮKassa)
- **ЮKassa** (при наличии — основной сценарий оплаты): `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL` (например `https://yourdomain.com/yookassa/return`), опционально `YOOKASSA_WEBHOOK_PATH=/webhooks/yookassa`, `YOOKASSA_WEBHOOK_IP_ALLOWLIST` (список IP через запятую для проверки webhook)
- `CRON_TZ` — часовой пояс для ежедневной задачи истечения доступа (по умолчанию `Europe/Moscow`)
- `INVITE_COOLDOWN_MINUTES` — не выдавать повторный инвайт в SELF-чат чаще чем раз в N минут (по умолчанию 15)
- `PENDING_TIMEOUT_HOURS` — заявки (pending) без пруфа старше N часов автоматически отклоняются (по умолчанию 48)
- `REVIEW_TIMEOUT_DAYS` — заявки с отправленным пруфом (ожидающие решения тренера) отклоняются по таймауту через N дней (по умолчанию 7)
- `EXECUTOR_FIO`, `EXECUTOR_INN`, `EXECUTOR_CONTACTS` — реквизиты Исполнителя для страниц /policy и /offer (рекомендуется заполнить перед запуском)

### 5. Prisma

```bash
npx prisma generate
npx prisma migrate deploy
npm run seed
```

После seed установите цены тарифов в БД (например через Prisma Studio: `npm run prisma:studio`).

### 6. Сборка и запуск

```bash
npm run build
npm start
```

Для production используйте systemd (см. **README_PROD.md**). Настроен автодеплой: при push в `main` GitHub Actions подключается к VPS и обновляет приложение — инструкция в README_PROD.md, раздел «7.1 Автодеплой с GitHub».

**Пример unit-файла systemd** (`/etc/systemd/system/pay-bot.service`):

```ini
[Unit]
Description=Pay-bot Telegram course sales
After=network.target postgresql.service

[Service]
Type=simple
User=paybot
WorkingDirectory=/opt/pay-bot
EnvironmentFile=/opt/pay-bot/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable pay-bot
sudo systemctl start pay-bot
```

### 7. Nginx + SSL (Let's Encrypt)

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Конфиг Nginx для проксирования на приложение (порт 3000):

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    # ssl_* директивы выставляет certbot

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Перезапуск Nginx: `sudo systemctl reload nginx`.

### 8. Webhook

После первого запуска приложение само выставляет webhook:

```
https://yourdomain.com/webhook
```

с `secret_token` из `WEBHOOK_SECRET`. Дополнительно в Telegram можно не настраивать — бот делает `setWebhook` при старте.

---

## Настройка тренера

1. **Узнать свой Telegram ID**  
   Напишите боту команду `/whoami` (после деплоя) — бот ответит только если ваш `user_id` совпадает с `TRAINER_TELEGRAM_ID` в `.env`. Скопируйте этот ID в `TRAINER_TELEGRAM_ID`.

2. **Общий чат для тарифа «Самостоятельный» (SELF)**  
   - Создайте группу в Telegram.  
   - Добавьте бота в группу и назначьте его **администратором** (минимум право «добавлять пользователей» или «пригласительные ссылки»).  
   - В этом чате выполните команду **`/bind_self_group`**.  
   - Бот сохранит `chat_id` в SystemConfig (ключ `SELF_GROUP_ID`). После оплаты ЮKassa по тарифу SELF ученик сразу получит одноразовую инвайт-ссылку (кнопка «Перейти в чат»).  
   - **Fallback:** можно задать `SELF_GROUP_ID` в `.env` (числовой id группы) — тогда не обязательно вызывать `/bind_self_group` (например, для автоматического деплоя). Приоритет: 1) SystemConfig, 2) env.

3. **Если чат привязали позже**  
   Для учеников, у которых доступ уже подтверждён, но чат ещё не был привязан, тренер может один раз выполнить **`/grant_pending_self`** — бот разошлёт инвайт-ссылки всем с активным SELF и `accessPending=true`.

4. **После привязки чата**  
   Если на момент **`/bind_self_group`** уже есть ожидающие (active + accessPending), бот предложит кнопку «✅ Выдать доступ (N)» — нажатие сразу рассылает инвайт-ссылки.

5. **Индивидуальный тариф (INDIVIDUAL): режим и личный чат**  
   В `.env` задаётся **`INDIVIDUAL_MODE`**: `DM` или `MANUAL_GROUP` (по умолчанию).

   - **DM:** после оплаты ученик получает контакт тренера (`TRAINER_USERNAME`, ссылка `tg://user?id=...`). Тренер пишет ученику напрямую в личку. Задайте **`TRAINER_USERNAME`** (без @) для удобства.
   - **MANUAL_GROUP (рекомендуется):** тренер создаёт отдельную группу для каждого ученика. После оплаты бот присылает тренеру инструкцию: создать группу «Индивидуальный — Имя — ORDER-...», добавить бота админом и в группе написать **`/bind_individual_chat ORDER-YYYYMMDD-XXXXX`**. Бот привяжет чат к заказу и отправит ученику одноразовую инвайт-ссылку. По истечении срока доступа cron автоматически исключит ученика из этой группы.

   **`INDIVIDUAL_INVITE_EXPIRE_MINUTES`** (по умолчанию 10) — время жизни инвайт-ссылки для личного чата.

---

## Экспорт покупок (тренер)

Команда **`/export_purchases`** с опциональными аргументами:

- **Формат:** `json` (по умолчанию) или `csv` (удобно открыть в Excel).
- **Фильтр:** `all`, `active`, `expired`, `self`, `individual`.

Примеры:

- ` /export_purchases` — все покупки в JSON
- ` /export_purchases csv` — все в CSV
- ` /export_purchases csv active` — только активные в CSV
- ` /export_purchases expired` — только истёкшие (JSON)

---

## Эндпоинты и сценарии

- **GET /health** — проверка работы, БД и наличия критичных переменных (TRAINER_TELEGRAM_ID, реквизиты оплаты, POLICY_VERSION, OFFER_VERSION). При отсутствии реквизитов или БД возвращает 503.
- **GET /policy** — HTML-страница политики ПДн (версия из `POLICY_VERSION`).
- **GET /offer** — HTML-страница оферты (версия из `OFFER_VERSION`).
- **POST /webhook** — обновления Telegram (заголовок `X-Telegram-Bot-Api-Secret-Token` должен совпадать с `WEBHOOK_SECRET`).
- **POST /webhooks/yookassa** — HTTP-уведомления ЮKassa (payment.succeeded, payment.canceled). Настраивается в ЛК ЮKassa: «Интеграция — HTTP-уведомления», URL: `https://yourdomain.com/webhooks/yookassa`. Требования: HTTPS, порт 443 или 8443, TLS 1.2+.
- **GET /yookassa/return** — страница после оплаты («Вернитесь в Telegram»).

**Сценарий с ЮKassa (при заданных YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY):** выбор тарифа → создаётся платёж в ЮKassa → пользователю кнопки «Оплатить» (confirmation_url) и «Проверить оплату». После оплаты webhook payment.succeeded активирует доступ автоматически; при отмене — payment.canceled, заявка отклоняется, пользователь может создать новую.

**Сценарий ручной оплаты:** реквизиты и orderCode → «Я оплатил(а)» → пруф → тренер подтверждает/отклоняет. Тренерские фолбеки: `/force_activate ORDER-...`, `/force_reject ORDER-...`.

---

## Минимальный прод-обвес

### Бэкапы PostgreSQL

Рекомендуется ежедневный бэкап с ротацией 7–14 дней:

```bash
# cron, например 02:00
0 2 * * * pg_dump -U paybot pay_bot | gzip > /var/backups/pay-bot/db_$(date +\%Y\%m\%d).sql.gz
# ротация: удалять файлы старше 14 дней
0 2 * * * find /var/backups/pay-bot -name 'db_*.sql.gz' -mtime +14 -delete
```

Каталог `/var/backups/pay-bot` создать заранее и выдать права пользователю, от которого запускается cron.

### Логи

- **В файл с ротацией:** настроить Pino (или другой транспорт) на запись в файл и использовать logrotate (например, по размеру или раз в день, хранение 7–14 дней).
- **Через systemd:** при запуске через `systemd` логи пишутся в journal; ограничить размер: в `journald.conf` задать `SystemMaxUse=100M` (или аналог), либо использовать `journalctl -u pay-bot` и ротировать вывод при необходимости.

---

## Тесты

```bash
npm run test
```

Покрыты: инварианты статусов Purchase, таймауты pending (без пруфа / с пруфом), распознавание игнорируемых ошибок Telegram, формат orderCode, UTF-8 BOM в CSV.

---

## Чек-лист ручного тестирования

1. **Согласие:** /start → ссылки на /policy и /offer → «Согласен(на)» → переход к имени. «Не согласен(на)» → сообщение о невозможности без согласия.
2. **Сбор данных:** ввод имени текстом → запрос телефона → request_contact → выбор тарифа.
3. **Тариф (ручная оплата):** при отсутствии ЮKassa — инструкция с ORDER-кодом и реквизитами, кнопка «Я оплатил(а)».
3a. **Тариф (ЮKassa):** при настроенной ЮKassa — сообщение с кнопками «Оплатить» и «Проверить оплату». Переход по «Оплатить» открывает страницу ЮKassa; после успешной оплаты webhook переводит заявку в active и выдаёт доступ. Кнопка «Проверить оплату» дергает GET /payments/{id} и при status=succeeded активирует заявку (фолбек при задержке webhook).
4. **Повторный выбор тарифа:** при уже существующей pending-заявке — сообщение «У вас уже есть заявка», тот же код; кнопка «Создать новую заявку» переводит старую в rejected (rejectReason=replaced) и создаёт новую с новым ORDER-кодом.
5. **Пруф:** «Я оплатил(а)» → запрос пруфа → отправка фото или текста → сообщение «Заявка передана тренеру», в БД проставляется proofSubmittedAt.
6. **Тренер: подтверждение:** у тренера приходит карточка заявки, кнопки «Подтвердить» / «Отклонить». Подтвердить → у ученика сообщение об активации доступа, у тренера — TRN_CONFIRMED.
7. **Тренер: отклонение:** Отклонить → у ученика MSG_REJECTED, у тренера TRN_REJECTED. Повторное нажатие на ту же заявку — «Заявка уже обработана».
8. **SELF, чат привязан:** после подтверждения ученик получает инвайт-ссылку (1 use, 10 мин). В БД lastInviteChatId сохраняется.
9. **SELF, чат не привязан:** сообщение «общий чат ещё настраивается». Тренер выполняет /bind_self_group в группе → кнопка «Выдать доступ (N)» → рассылка инвайтов.
10. **Cooldown инвайтов:** повторная выдача инвайта тому же пользователю в течение INVITE_COOLDOWN_MINUTES для того же чата — пропуск. После перепривязки чата (другой lastInviteChatId) — инвайт выдаётся снова.
11. **INDIVIDUAL:** после подтверждения ученик пишет боту → сообщение пересылается тренеру с шапкой. Ответ тренера (reply) доставляется ученику.
12. **Истечение доступа:** cron в 03:00 (CRON_TZ): active с accessExpiresAt &lt; now → status=expired, SELF — кик из чата (игнорируемые ошибки не роняют цикл), уведомления ученику и тренеру.
13. **Таймаут pending:** без пруфа — rejectReason=timeout_no_proof; с пруфом (тренер не подтвердил) — timeout_no_review; тренеру уходит сводка. В экспорте reviewedBy=0 отображается как "system".
14. **Экспорт:** /export_purchases csv active — файл CSV с UTF-8 BOM открывается в Excel с корректной кириллицей. BigInt в JSON/CSV — строки.
15. **Health:** GET /health — 200 при наличии БД и реквизитов; 503 при отключённой БД или отсутствии реквизитов.
16. **ЮKassa (ручной тест в тестовом магазине):** создать заявку по тарифу → нажать «Оплатить» → оплатить тестовой картой (см. доки ЮKassa) → убедиться, что пришёл webhook и доступ активирован; проверить уведомление тренеру и напоминание про чек для самозанятых. Отмена платежа на стороне ЮKassa → webhook payment.canceled → заявка rejected, пользователь получает сообщение «Платеж отменён…».
17. **Тренер: force_activate / force_reject:** `/force_activate ORDER-YYYYMMDD-XXXXX` — активирует pending вручную; `/force_reject ORDER-...` — отклоняет. Экспорт: в CSV/JSON присутствуют поля ykPaymentId, ykStatus, paymentProvider.

---

## Настройка ЮKassa

1. В личном кабинете ЮKassa: **Интеграция → HTTP-уведомления**. Включите уведомления, укажите URL: `https://ВАШ_ДОМЕН/webhooks/yookassa`. События: **payment.succeeded**, **payment.canceled**. Сохраните.
2. Требования к URL: HTTPS, порт 443 или 8443, TLS 1.2+. Рекомендуется проверить подлинность по IP (список подсетей ЮKassa в [документации](https://yookassa.ru/developers/using-api/webhooks)); задайте `YOOKASSA_WEBHOOK_IP_ALLOWLIST` (через запятую).
3. В приложении задайте `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL` (страница после оплаты, например `https://ВАШ_ДОМЕН/yookassa/return`). После этого новый выбор тарифа создаёт платёж в ЮKassa и показывает кнопку «Оплатить».

---

## Лицензия

MIT (или по вашему выбору).
