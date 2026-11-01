-- DropIndex
DROP INDEX "knowledge_item_part_idx";

-- AlterTable
ALTER TABLE "knowledge_item" ADD COLUMN     "model" TEXT NOT NULL DEFAULT 'local';

-- CreateIndex
CREATE INDEX "knowledge_item_model_part_idx" ON "knowledge_item"("model", "part");
