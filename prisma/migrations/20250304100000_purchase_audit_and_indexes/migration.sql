-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'SBP');

-- CreateEnum
CREATE TYPE "ProofType" AS ENUM ('SCREENSHOT', 'TEXT');

-- AlterTable purchases: add audit, proof, invite fields and updated_at
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "amount" INTEGER;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'RUB';
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "payment_method" "PaymentMethod";
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "reviewed_by" BIGINT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "reject_reason" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "proof_type" "ProofType";
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "proof_text" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "proof_file_id" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "invite_sent_at" TIMESTAMP(3);
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill amount from tariff for existing rows
UPDATE "purchases" SET "amount" = (SELECT "price" FROM "tariffs" WHERE "tariffs"."id" = "purchases"."tariff_id"), "currency" = 'RUB' WHERE "amount" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchases_status_access_expires_at_idx" ON "purchases"("status", "access_expires_at");
CREATE INDEX IF NOT EXISTS "purchases_user_id_created_at_idx" ON "purchases"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "purchases_tariff_id_created_at_idx" ON "purchases"("tariff_id", "created_at");

-- SupportMessageMap: FK to users and index
CREATE INDEX IF NOT EXISTS "support_message_map_user_telegram_id_idx" ON "support_message_map"("user_telegram_id");
ALTER TABLE "support_message_map" ADD CONSTRAINT "support_message_map_user_telegram_id_fkey" FOREIGN KEY ("user_telegram_id") REFERENCES "users"("telegram_id") ON DELETE CASCADE ON UPDATE CASCADE;
