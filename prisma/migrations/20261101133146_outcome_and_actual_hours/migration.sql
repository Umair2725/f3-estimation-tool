-- CreateEnum
CREATE TYPE "ProjectOutcome" AS ENUM ('NONE', 'IN_DELIVERY', 'LOST', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ActualsSource" AS ENUM ('MANUAL', 'FILE');

-- CreateEnum
CREATE TYPE "ActualStatus" AS ENUM ('MATCHED', 'UNPLANNED', 'DROPPED');

-- AlterTable
ALTER TABLE "estimation_request" ADD COLUMN     "outcome" "ProjectOutcome" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "outcome_changed_at" TIMESTAMP(3),
ADD COLUMN     "outcome_changed_by_id" TEXT,
ADD COLUMN     "outcome_reason" TEXT;

-- CreateTable
CREATE TABLE "actuals_version" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "source" "ActualsSource" NOT NULL,
    "file_name" TEXT,
    "file_bytes" BYTEA,
    "fingerprint" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actuals_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actual_hours" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "sub_task_id" TEXT,
    "request_part_id" TEXT,
    "part_label" TEXT NOT NULL,
    "task_title" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "est_min_tenths" INTEGER NOT NULL DEFAULT 0,
    "est_max_tenths" INTEGER NOT NULL DEFAULT 0,
    "actual_tenths" INTEGER,
    "status" "ActualStatus" NOT NULL,
    "similarity" DOUBLE PRECISION,
    "flags" TEXT[],
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "actual_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actuals_upload" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_bytes" BYTEA NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actuals_upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "actuals_version_request_id_number_key" ON "actuals_version"("request_id", "number");

-- CreateIndex
CREATE INDEX "actual_hours_version_id_position_idx" ON "actual_hours"("version_id", "position");

-- CreateIndex
CREATE INDEX "actual_hours_sub_task_id_idx" ON "actual_hours"("sub_task_id");

-- AddForeignKey
ALTER TABLE "actuals_version" ADD CONSTRAINT "actuals_version_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actuals_version" ADD CONSTRAINT "actuals_version_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_hours" ADD CONSTRAINT "actual_hours_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "actuals_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_hours" ADD CONSTRAINT "actual_hours_sub_task_id_fkey" FOREIGN KEY ("sub_task_id") REFERENCES "sub_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_hours" ADD CONSTRAINT "actual_hours_request_part_id_fkey" FOREIGN KEY ("request_part_id") REFERENCES "request_part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actuals_upload" ADD CONSTRAINT "actuals_upload_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actuals_upload" ADD CONSTRAINT "actuals_upload_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
