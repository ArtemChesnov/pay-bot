-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "individual_chat_id" BIGINT,
ADD COLUMN     "individual_invite_sent_at" TIMESTAMP(3),
ADD COLUMN     "individual_last_invite_chat_id" BIGINT;
