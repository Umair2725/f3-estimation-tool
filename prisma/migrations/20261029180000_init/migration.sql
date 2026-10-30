-- Vector similarity search, needed later for feature matching (F-04) and benchmarks (F-24).
-- The health check reports an error if this extension is missing.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "app_meta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_meta_pkey" PRIMARY KEY ("key")
);
