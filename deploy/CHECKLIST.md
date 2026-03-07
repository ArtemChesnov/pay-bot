# Чек-лист: Pay-bot Production

## Перед первым запуском

- [ ] Домен/субдомен указывает на IP VPS (`dig bot.example.ru` или `nslookup bot.example.ru`)
- [ ] На VPS создан пользователь `botapp`, каталог `/opt/bot` с правами `botapp:botapp`
- [ ] Установлен Node.js 20 LTS, в PATH доступны `node` и `npm`
- [ ] Установлен и запущен PostgreSQL, созданы роль `botapp` и БД `pay_bot`
- [ ] Файл `/etc/bot.env` создан, заданы все обязательные переменные:
  - `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, `WEBHOOK_BASE_URL`
  - `TRAINER_TELEGRAM_ID`, реквизиты (`CARD_NUMBER` и/или `SBP_PHONE`)
  - при необходимости: `POLICY_VERSION`, `OFFER_VERSION`, `CRON_TZ`, таймауты, исполнитель
- [ ] Права на `/etc/bot.env`: `640`, владелец `root:botapp`
- [ ] Nginx установлен, конфиг для `server_name bot.example.ru` создан и включён, `nginx -t` без ошибок
- [ ] Выполнен `certbot --nginx -d bot.example.ru`, сайт открывается по HTTPS
- [ ] Код в `/opt/bot`, выполнены `npm ci`, `npm run build`, `npm run prisma:migrate`
- [ ] Unit `pay-bot.service` в `/etc/systemd/system/`, выполнен `systemctl daemon-reload` и `systemctl enable pay-bot`
- [ ] Firewall ufw: открыты только 22, 80, 443; `ufw status` корректен
- [ ] В `WEBHOOK_BASE_URL` указан тот же домен, что и в Nginx (например `https://bot.example.ru`)

## После первого запуска

- [ ] `systemctl status pay-bot` — active (running)
- [ ] `curl -s https://bot.example.ru/health` — 200, `"status": "ok"`, `"db": "connected"`
- [ ] `getWebhookInfo` в API Telegram — url совпадает с `WEBHOOK_BASE_URL/webhook`
- [ ] В Telegram бот отвечает на /start и показывает ссылки на /policy и /offer
- [ ] Страницы https://bot.example.ru/policy и https://bot.example.ru/offer открываются
- [ ] Тренеру доступны /whoami, /bind_self_group (в группе), /grant_pending_self
- [ ] Настроен cron бэкапа, выполнена одна ручная выгрузка в каталог бэкапов
- [ ] Проведён тест полного сценария: согласие → имя → телефон → тариф → оплата (или подтверждение тренером)

## Быстрые команды диагностики

```bash
sudo systemctl status pay-bot
journalctl -u pay-bot -f
curl -s https://bot.example.ru/health | jq .
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | jq .
sudo nginx -t
sudo certbot renew --dry-run
```
