-- CreateEnum
CREATE TYPE "ExportKind" AS ENUM ('INTERNAL', 'CLIENT');

-- AlterTable
ALTER TABLE "estimation_request" ADD COLUMN     "bug_fix_percent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "hourly_rate" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "pm_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pm_percent" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "qa_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "qa_percent" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "rate_confirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "request_part" ADD COLUMN     "assumptions" TEXT[],
ADD COLUMN     "deployment_max_tenths" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deployment_min_tenths" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "risks" TEXT[];

-- CreateTable
CREATE TABLE "estimate_task" (
    "id" TEXT NOT NULL,
    "feature_id" TEXT NOT NULL,
    "request_part_id" TEXT NOT NULL,

    CONSTRAINT "estimate_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_task" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "min_tenths" INTEGER NOT NULL,
    "max_tenths" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,

    CONSTRAINT "sub_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_defaults" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "qa_percent" INTEGER NOT NULL DEFAULT 25,
    "pm_percent" INTEGER NOT NULL DEFAULT 30,
    "bug_fix_percent" INTEGER NOT NULL DEFAULT 10,
    "default_rate" INTEGER NOT NULL DEFAULT 30,
    "approved_rates" INTEGER[] DEFAULT ARRAY[25, 30, 35, 40, 45, 50]::INTEGER[],
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "estimate_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_record" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "ExportKind" NOT NULL,
    "file_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_task_request_part_id_idx" ON "estimate_task"("request_part_id");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_task_feature_id_request_part_id_key" ON "estimate_task"("feature_id", "request_part_id");

-- CreateIndex
CREATE INDEX "sub_task_task_id_position_idx" ON "sub_task"("task_id", "position");

-- CreateIndex
CREATE INDEX "export_record_request_id_created_at_idx" ON "export_record"("request_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "estimate_task" ADD CONSTRAINT "estimate_task_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_task" ADD CONSTRAINT "estimate_task_request_part_id_fkey" FOREIGN KEY ("request_part_id") REFERENCES "request_part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_task" ADD CONSTRAINT "sub_task_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "estimate_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_record" ADD CONSTRAINT "export_record_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_record" ADD CONSTRAINT "export_record_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Starting estimate defaults (specs/estimate-defaults). Admins change them in Settings.
INSERT INTO "estimate_defaults" ("id", "updated_at") VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
