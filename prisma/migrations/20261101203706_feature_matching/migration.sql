-- CreateEnum
CREATE TYPE "KnowledgeKind" AS ENUM ('APPROVED_PRE_AI', 'APPROVED_AI_ERA', 'ARCHITECT_REFERENCE');

-- CreateEnum
CREATE TYPE "ReferenceRequestStatus" AS ENUM ('OPEN', 'ANSWERED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SuggestionMethod" AS ENUM ('ARCHITECT_REFERENCE', 'AI_ERA_ACTUALS', 'PRE_AI_MATCH', 'AI_GUESS', 'NO_MATCH');

-- CreateEnum
CREATE TYPE "SuggestionDecision" AS ENUM ('PENDING', 'ACCEPTED', 'ADJUSTED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'REFERENCE_REQUESTED';
ALTER TYPE "NotificationKind" ADD VALUE 'REFERENCE_ADDED';
ALTER TYPE "NotificationKind" ADD VALUE 'REFERENCE_DECLINED';

-- CreateTable
CREATE TABLE "knowledge_item" (
    "id" TEXT NOT NULL,
    "kind" "KnowledgeKind" NOT NULL,
    "request_id" TEXT,
    "version" INTEGER,
    "reference_id" TEXT,
    "part" "ProjectPart" NOT NULL,
    "part_label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sub_tasks" JSONB NOT NULL,
    "min_tenths" INTEGER NOT NULL,
    "max_tenths" INTEGER NOT NULL,
    "actual_tenths" INTEGER,
    "project_name" TEXT,
    "client_name" TEXT,
    "author_name" TEXT,
    "source_date" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_reference" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "part" "ProjectPart" NOT NULL,
    "stack" TEXT[],
    "sub_tasks" JSONB NOT NULL,
    "author_id" TEXT NOT NULL,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_request" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "task_id" TEXT,
    "feature_name" TEXT NOT NULL,
    "feature_description" TEXT NOT NULL DEFAULT '',
    "part" "ProjectPart" NOT NULL,
    "part_label" TEXT NOT NULL,
    "stack" TEXT[],
    "note" TEXT NOT NULL DEFAULT '',
    "asked_by_id" TEXT NOT NULL,
    "architect_id" TEXT NOT NULL,
    "status" "ReferenceRequestStatus" NOT NULL DEFAULT 'OPEN',
    "decline_reason" TEXT,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),

    CONSTRAINT "reference_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_suggestion" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "method" "SuggestionMethod" NOT NULL,
    "matches" JSONB NOT NULL,
    "suggested" JSONB,
    "suggested_min_tenths" INTEGER,
    "suggested_max_tenths" INTEGER,
    "decision" "SuggestionDecision" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_item_part_idx" ON "knowledge_item"("part");

-- CreateIndex
CREATE INDEX "knowledge_item_request_id_idx" ON "knowledge_item"("request_id");

-- CreateIndex
CREATE INDEX "reference_request_architect_id_status_idx" ON "reference_request"("architect_id", "status");

-- CreateIndex
CREATE INDEX "reference_request_request_id_idx" ON "reference_request"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_suggestion_task_id_key" ON "task_suggestion"("task_id");

-- AddForeignKey
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "feature_reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_reference" ADD CONSTRAINT "feature_reference_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_reference" ADD CONSTRAINT "feature_reference_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_request" ADD CONSTRAINT "reference_request_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_request" ADD CONSTRAINT "reference_request_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "estimate_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_request" ADD CONSTRAINT "reference_request_asked_by_id_fkey" FOREIGN KEY ("asked_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_request" ADD CONSTRAINT "reference_request_architect_id_fkey" FOREIGN KEY ("architect_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_request" ADD CONSTRAINT "reference_request_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "feature_reference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_suggestion" ADD CONSTRAINT "task_suggestion_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "estimate_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_suggestion" ADD CONSTRAINT "task_suggestion_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
