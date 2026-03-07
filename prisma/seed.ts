import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const self = await prisma.tariff.findFirst({ where: { type: "SELF" } });
  if (!self) {
    await prisma.tariff.create({
      data: {
        title: "Самостоятельный",
        price: 0,
        durationDays: 90,
        type: "SELF",
        isActive: true,
      },
    });
    console.log("Created SELF tariff (90 days). Set price in DB.");
  }
  const individual = await prisma.tariff.findFirst({ where: { type: "INDIVIDUAL" } });
  if (!individual) {
    await prisma.tariff.create({
      data: {
        title: "Индивидуальный",
        price: 0,
        durationDays: 150,
        type: "INDIVIDUAL",
        isActive: true,
      },
    });
    console.log("Created INDIVIDUAL tariff (150 days). Set price in DB.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
