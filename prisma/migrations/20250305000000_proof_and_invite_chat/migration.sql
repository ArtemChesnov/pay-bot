-- AlterTable
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "proof_submitted_at" TIMESTAMP(3);
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "last_invite_chat_id" BIGINT;
