import "./load-env";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const SELF_PRICE = 3900;
  const INDIVIDUAL_PRICE = 10500;

  const self = await prisma.tariff.findFirst({ where: { type: "SELF" } });
  if (!self) {
    await prisma.tariff.create({
      data: {
        title: "Самостоятельный",
        price: SELF_PRICE,
        durationDays: 90,
        type: "SELF",
        isActive: true,
      },
    });
    console.log("Created SELF tariff (90 days, 3900 ₽).");
  } else if (self.price === 0) {
    await prisma.tariff.update({ where: { id: self.id }, data: { price: SELF_PRICE } });
    console.log("Updated SELF tariff price to 3900 ₽.");
  }

  const individual = await prisma.tariff.findFirst({ where: { type: "INDIVIDUAL" } });
  if (!individual) {
    await prisma.tariff.create({
      data: {
        title: "Индивидуальный",
        price: INDIVIDUAL_PRICE,
        durationDays: 150,
        type: "INDIVIDUAL",
        isActive: true,
      },
    });
    console.log("Created INDIVIDUAL tariff (150 days, 10500 ₽).");
  } else if (individual.price === 0) {
    await prisma.tariff.update({ where: { id: individual.id }, data: { price: INDIVIDUAL_PRICE } });
    console.log("Updated INDIVIDUAL tariff price to 10500 ₽.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
