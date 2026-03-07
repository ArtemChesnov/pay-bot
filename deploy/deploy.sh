#!/usr/bin/env bash
# Запускать на сервере из корня проекта: ./deploy/deploy.sh
# Или из GitHub Actions через SSH (команды из .github/workflows/deploy.yml).

set -e
cd "$(dirname "$0")/.."

git fetch origin main
git reset --hard origin/main

npm ci
npm run build
npx prisma migrate deploy

sudo systemctl restart pay-bot
echo "Deploy done."
