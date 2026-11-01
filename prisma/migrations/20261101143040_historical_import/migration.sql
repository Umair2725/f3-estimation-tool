-- CreateEnum
CREATE TYPE "RequestOrigin" AS ENUM ('NEW', 'IMPORTED');

-- CreateEnum
CREATE TYPE "HoursBaseline" AS ENUM ('AI_ERA', 'PRE_AI');

-- CreateEnum
CREATE TYPE "UploadedFileKind" AS ENUM ('ESTIMATE', 'ACTUALS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('READY', 'FAILED', 'APPROVED', 'REJECTED', 'SKIPPED');

-- AlterTable
ALTER TABLE "estimation_request" ADD COLUMN     "baseline" "HoursBaseline" NOT NULL DEFAULT 'AI_ERA',
ADD COLUMN     "origin" "RequestOrigin" NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "sub_task" ADD COLUMN     "source_file_id" TEXT,
ADD COLUMN     "source_row" INTEGER,
ADD COLUMN     "source_sheet" TEXT;

-- CreateTable
CREATE TABLE "uploaded_file" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" "UploadedFileKind" NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "notes" TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_project" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "estimate_file_id" TEXT,
    "actuals_file_id" TEXT,
    "status" "ImportStatus" NOT NULL,
    "failure" TEXT,
    "parsed" JSONB,
    "actuals_parsed" JSONB,
    "decisions" JSONB NOT NULL DEFAULT '{}',
    "duplicate" JSONB,
    "request_id" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "imported_project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uploaded_file_fingerprint_idx" ON "uploaded_file"("fingerprint");

-- CreateIndex
CREATE INDEX "imported_project_batch_id_position_idx" ON "imported_project"("batch_id", "position");

-- AddForeignKey
ALTER TABLE "sub_task" ADD CONSTRAINT "sub_task_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "uploaded_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_file" ADD CONSTRAINT "uploaded_file_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_project" ADD CONSTRAINT "imported_project_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_project" ADD CONSTRAINT "imported_project_estimate_file_id_fkey" FOREIGN KEY ("estimate_file_id") REFERENCES "uploaded_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_project" ADD CONSTRAINT "imported_project_actuals_file_id_fkey" FOREIGN KEY ("actuals_file_id") REFERENCES "uploaded_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_project" ADD CONSTRAINT "imported_project_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_project" ADD CONSTRAINT "imported_project_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
