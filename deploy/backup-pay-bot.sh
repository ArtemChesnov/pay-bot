#!/bin/bash
# Бэкап БД Pay-bot: pg_dump + gzip, ротация N дней
# Установка: sudo cp deploy/backup-pay-bot.sh /usr/local/bin/ && sudo chmod +x /usr/local/bin/backup-pay-bot.sh
# Cron: 0 2 * * * /usr/local/bin/backup-pay-bot.sh

set -e
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pay-bot}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATE=$(date +%Y%m%d)

# Загрузить пароль из env (или задать здесь для cron)
if [ -r /etc/bot.env ]; then
  set -a
  source /etc/bot.env
  set +a
fi
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set. Set in /etc/bot.env or export." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
# Извлечь хост, пользователя, БД из URL при необходимости; здесь простой вариант через pg_dump с URL
pg_dump "$DATABASE_URL" -Fc | gzip > "$BACKUP_DIR/pay_bot_$DATE.sql.gz"
find "$BACKUP_DIR" -name "pay_bot_*.sql.gz" -mtime +$RETENTION_DAYS -delete
