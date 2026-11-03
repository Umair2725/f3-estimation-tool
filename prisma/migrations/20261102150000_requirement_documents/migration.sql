-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CLIENT_REQUIREMENTS', 'FOLIO3_SOW');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('READING', 'READY', 'FAILED', 'NOT_SET_UP');

-- CreateTable
CREATE TABLE "request_document" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "format" "DocumentFormat" NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "page_count" INTEGER NOT NULL,
    "text_layer" JSONB NOT NULL,
    "status" "DocumentStatus" NOT NULL,
    "error" TEXT,
    "read_started_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "model" TEXT,
    "proposal" JSONB,
    "added_item_ids" TEXT[],
    "added_at" TIMESTAMP(3),
    "added_by_id" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_question" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "source" JSONB,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "request_document_request_id_created_at_idx" ON "request_document"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "client_question_request_id_position_idx" ON "client_question"("request_id", "position");

-- AddForeignKey
ALTER TABLE "request_document" ADD CONSTRAINT "request_document_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_question" ADD CONSTRAINT "client_question_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

