-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "ProjectPart" AS ENUM ('BACKEND', 'WEB_FRONTEND', 'ADMIN_PANEL', 'MOBILE', 'CLOUD_INFRA');

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimation_request" (
    "id" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "client_id" TEXT,
    "project_manager" TEXT NOT NULL,
    "project_date" DATE NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "owner_id" TEXT NOT NULL,
    "last_step" INTEGER NOT NULL DEFAULT 1,
    "application_types" TEXT[],
    "operating_systems" TEXT[],
    "browsers" TEXT[],
    "considerations" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimation_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_part" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "part" "ProjectPart" NOT NULL,

    CONSTRAINT "request_part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_part_technology" (
    "request_part_id" TEXT NOT NULL,
    "technology_id" TEXT NOT NULL,

    CONSTRAINT "request_part_technology_pkey" PRIMARY KEY ("request_part_id","technology_id")
);

-- CreateTable
CREATE TABLE "technology" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "parts" "ProjectPart"[],
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parts" "ProjectPart"[],
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_name_key_key" ON "client"("name_key");

-- CreateIndex
CREATE INDEX "estimation_request_updated_at_idx" ON "estimation_request"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "estimation_request_owner_id_status_idx" ON "estimation_request"("owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "request_part_request_id_part_key" ON "request_part"("request_id", "part");

-- CreateIndex
CREATE INDEX "request_part_technology_technology_id_idx" ON "request_part_technology"("technology_id");

-- CreateIndex
CREATE UNIQUE INDEX "technology_name_key_key" ON "technology"("name_key");

-- CreateIndex
CREATE INDEX "feature_request_id_position_idx" ON "feature"("request_id", "position");

-- AddForeignKey
ALTER TABLE "estimation_request" ADD CONSTRAINT "estimation_request_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimation_request" ADD CONSTRAINT "estimation_request_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_part" ADD CONSTRAINT "request_part_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_part_technology" ADD CONSTRAINT "request_part_technology_request_part_id_fkey" FOREIGN KEY ("request_part_id") REFERENCES "request_part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_part_technology" ADD CONSTRAINT "request_part_technology_technology_id_fkey" FOREIGN KEY ("technology_id") REFERENCES "technology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature" ADD CONSTRAINT "feature_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Search by project or client name (home-screen spec): case-insensitive partial match.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "estimation_request_project_name_trgm_idx" ON "estimation_request" USING gin ("project_name" gin_trgm_ops);
CREATE INDEX "client_name_trgm_idx" ON "client" USING gin ("name" gin_trgm_ops);

-- Starting tech stack catalog (tech-stack-catalog spec). Admins manage it afterwards.
INSERT INTO "technology" ("id", "name", "name_key", "parts") VALUES
  (gen_random_uuid(), 'React',          'react',          ARRAY['WEB_FRONTEND','ADMIN_PANEL']::"ProjectPart"[]),
  (gen_random_uuid(), 'Next.js',        'next.js',        ARRAY['WEB_FRONTEND','ADMIN_PANEL']::"ProjectPart"[]),
  (gen_random_uuid(), 'Angular',        'angular',        ARRAY['WEB_FRONTEND','ADMIN_PANEL']::"ProjectPart"[]),
  (gen_random_uuid(), 'Vue',            'vue',            ARRAY['WEB_FRONTEND','ADMIN_PANEL']::"ProjectPart"[]),
  (gen_random_uuid(), 'Node.js',        'node.js',        ARRAY['BACKEND']::"ProjectPart"[]),
  (gen_random_uuid(), '.NET',           '.net',           ARRAY['BACKEND']::"ProjectPart"[]),
  (gen_random_uuid(), 'Python',         'python',         ARRAY['BACKEND']::"ProjectPart"[]),
  (gen_random_uuid(), 'Java',           'java',           ARRAY['BACKEND']::"ProjectPart"[]),
  (gen_random_uuid(), 'PHP',            'php',            ARRAY['BACKEND']::"ProjectPart"[]),
  (gen_random_uuid(), 'Flutter',        'flutter',        ARRAY['MOBILE']::"ProjectPart"[]),
  (gen_random_uuid(), 'React Native',   'react native',   ARRAY['MOBILE']::"ProjectPart"[]),
  (gen_random_uuid(), 'Swift',          'swift',          ARRAY['MOBILE']::"ProjectPart"[]),
  (gen_random_uuid(), 'Kotlin',         'kotlin',         ARRAY['MOBILE']::"ProjectPart"[]),
  (gen_random_uuid(), 'AWS',            'aws',            ARRAY['CLOUD_INFRA']::"ProjectPart"[]),
  (gen_random_uuid(), 'Azure',          'azure',          ARRAY['CLOUD_INFRA']::"ProjectPart"[]),
  (gen_random_uuid(), 'Google Cloud',   'google cloud',   ARRAY['CLOUD_INFRA']::"ProjectPart"[])
ON CONFLICT ("name_key") DO NOTHING;
