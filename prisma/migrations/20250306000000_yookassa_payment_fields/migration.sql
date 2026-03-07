-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'YOOKASSA');

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "payment_provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "yk_payment_id" TEXT,
ADD COLUMN     "yk_status" TEXT,
ADD COLUMN     "yk_confirmation_url" TEXT,
ADD COLUMN     "yk_idempotence_key" TEXT,
ADD COLUMN     "yk_paid_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_yk_payment_id_key" ON "purchases"("yk_payment_id");
