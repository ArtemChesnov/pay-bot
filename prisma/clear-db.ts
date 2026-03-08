/**
 * Очистка данных бота: пользователи, заявки, переписка с тренером, системный конфиг.
 * Тарифы не удаляются — после очистки можно сразу оформлять новые заявки.
 * Запуск: npm run db:clear  или  npx tsx prisma/clear-db.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const deletedSupport = await prisma.supportMessageMap.deleteMany({});
  const deletedPurchases = await prisma.purchase.deleteMany({});
  const deletedUsers = await prisma.user.deleteMany({});
  const deletedConfig = await prisma.systemConfig.deleteMany({});

  console.log("Очистка базы:");
  console.log("  support_message_map:", deletedSupport.count);
  console.log("  purchases:", deletedPurchases.count);
  console.log("  users:", deletedUsers.count);
  console.log("  system_config:", deletedConfig.count);
  console.log("Готово. Тарифы сохранены. Можно запустить npm run seed для проверки тарифов.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
