-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('INVITATION', 'ACCESS_GRANTED', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REFERENCE_REQUESTED', 'REFERENCE_ADDED', 'REFERENCE_DECLINED', 'TEST');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'NOT_SENT');

-- CreateTable
CREATE TABLE "email_message" (
    "id" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "user_id" TEXT,
    "request_id" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_message_status_created_at_idx" ON "email_message"("status", "created_at");

