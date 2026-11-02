-- Feature benchmarks (specs/feature-benchmarks). Architect references become Draft benchmarks
-- (FB-9001 up, keeping their ids), then the reference table and enum value are removed.

-- CreateEnum
CREATE TYPE "BenchmarkPart" AS ENUM ('WEB_FRONTEND', 'BACKEND', 'ADMIN_PANEL', 'MOBILE', 'CLOUD_INFRA', 'DESIGN', 'ANY');
CREATE TYPE "BenchmarkStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'RETIRED');
CREATE TYPE "DeveloperLevel" AS ENUM ('EXPERIENCED', 'JUNIOR', 'MIXED');
CREATE TYPE "ObservationSource" AS ENUM ('MANUAL', 'SURVEY', 'ACTUALS');
CREATE TYPE "BenchmarkChangeKind" AS ENUM ('IMPORT', 'EDIT', 'RECALCULATED', 'PROPOSED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'CONFIRMED', 'RETIRED', 'REFERENCE');

-- CreateTable
CREATE TABLE "feature_benchmark" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT '',
    "feature" TEXT NOT NULL,
    "part" "BenchmarkPart" NOT NULL,
    "stack" TEXT NOT NULL DEFAULT 'Any',
    "included" TEXT NOT NULL DEFAULT '',
    "pre_ai_min_tenths" INTEGER,
    "pre_ai_max_tenths" INTEGER,
    "pre_ai_source" TEXT,
    "experienced_tenths" INTEGER,
    "junior_tenths" INTEGER,
    "ai_tools" TEXT NOT NULL DEFAULT '',
    "projects_count" INTEGER NOT NULL DEFAULT 0,
    "status" "BenchmarkStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "breakdown" JSONB,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_benchmark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "benchmark_observation" (
    "id" TEXT NOT NULL,
    "benchmark_id" TEXT NOT NULL,
    "level" "DeveloperLevel" NOT NULL,
    "hours_tenths" INTEGER NOT NULL,
    "observed_on" DATE NOT NULL,
    "source" "ObservationSource" NOT NULL,
    "ai_tools" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "request_id" TEXT,
    "actuals_version_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_observation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "benchmark_change" (
    "id" TEXT NOT NULL,
    "benchmark_id" TEXT NOT NULL,
    "kind" "BenchmarkChangeKind" NOT NULL,
    "from_experienced" INTEGER,
    "from_junior" INTEGER,
    "to_experienced" INTEGER,
    "to_junior" INTEGER,
    "observation_ids" TEXT[],
    "note" TEXT NOT NULL DEFAULT '',
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_change_pkey" PRIMARY KEY ("id")
);

-- AlterTable: new links (filled below where they replace references)
ALTER TABLE "actuals_version" ADD COLUMN "team_level" "DeveloperLevel";
ALTER TABLE "knowledge_item" ADD COLUMN "benchmark_id" TEXT,
ALTER COLUMN "part" DROP NOT NULL;
ALTER TABLE "reference_request" ADD COLUMN "benchmark_id" TEXT;
ALTER TABLE "sub_task" ADD COLUMN "benchmark_id" TEXT;

-- Convert Architect references into Draft benchmarks, keeping their ids.
INSERT INTO "feature_benchmark" (
    "id", "code", "module", "feature", "part", "stack", "included",
    "experienced_tenths", "junior_tenths", "status", "notes", "breakdown",
    "created_by_id", "created_at", "updated_at"
)
SELECT
    r."id",
    'FB-' || (9000 + row_number() OVER (ORDER BY r."created_at", r."id")),
    'From requests',
    r."title",
    r."part"::text::"BenchmarkPart",
    COALESCE(NULLIF(array_to_string(r."stack", ', '), ''), 'Any'),
    r."description",
    (SELECT COALESCE(SUM((s->>'minTenths')::int), 0) FROM jsonb_array_elements(r."sub_tasks") s),
    (SELECT COALESCE(SUM((s->>'maxTenths')::int), 0) FROM jsonb_array_elements(r."sub_tasks") s),
    'DRAFT',
    'Added as reference hours by an Architect',
    r."sub_tasks",
    r."author_id",
    r."created_at",
    CURRENT_TIMESTAMP
FROM "feature_reference" r;

INSERT INTO "benchmark_change" ("id", "benchmark_id", "kind", "to_experienced", "to_junior", "observation_ids", "note", "actor_id", "created_at")
SELECT gen_random_uuid()::text, b."id", 'REFERENCE', b."experienced_tenths", b."junior_tenths", '{}', 'Reference hours from an Architect', b."created_by_id", b."created_at"
FROM "feature_benchmark" b;

UPDATE "reference_request" SET "benchmark_id" = "reference_id" WHERE "reference_id" IS NOT NULL;

-- The index is rebuilt by `npm run reindex-knowledge`; reference entries go now.
DELETE FROM "knowledge_item" WHERE "kind" = 'ARCHITECT_REFERENCE';
UPDATE "task_suggestion"
SET "matches" = replace("matches"::text, '"ARCHITECT_REFERENCE"', '"BENCHMARK_DRAFT"')::jsonb
WHERE "matches"::text LIKE '%ARCHITECT_REFERENCE%';

-- AlterEnum
BEGIN;
CREATE TYPE "KnowledgeKind_new" AS ENUM ('APPROVED_PRE_AI', 'APPROVED_AI_ERA', 'BENCHMARK_CONFIRMED', 'BENCHMARK_DRAFT');
ALTER TABLE "knowledge_item" ALTER COLUMN "kind" TYPE "KnowledgeKind_new" USING ("kind"::text::"KnowledgeKind_new");
ALTER TYPE "KnowledgeKind" RENAME TO "KnowledgeKind_old";
ALTER TYPE "KnowledgeKind_new" RENAME TO "KnowledgeKind";
DROP TYPE "public"."KnowledgeKind_old";
COMMIT;

BEGIN;
CREATE TYPE "SuggestionMethod_new" AS ENUM ('BENCHMARK_CONFIRMED', 'BENCHMARK_DRAFT', 'AI_ERA_ACTUALS', 'AI_ERA_ESTIMATE', 'PRE_AI_MATCH', 'AI_GUESS', 'NO_MATCH');
ALTER TABLE "task_suggestion" ALTER COLUMN "method" TYPE "SuggestionMethod_new"
    USING ((CASE WHEN "method"::text = 'ARCHITECT_REFERENCE' THEN 'BENCHMARK_DRAFT' ELSE "method"::text END)::"SuggestionMethod_new");
ALTER TYPE "SuggestionMethod" RENAME TO "SuggestionMethod_old";
ALTER TYPE "SuggestionMethod_new" RENAME TO "SuggestionMethod";
DROP TYPE "public"."SuggestionMethod_old";
COMMIT;

-- Drop the reference table and its links
ALTER TABLE "feature_reference" DROP CONSTRAINT "feature_reference_author_id_fkey";
ALTER TABLE "feature_reference" DROP CONSTRAINT "feature_reference_request_id_fkey";
ALTER TABLE "knowledge_item" DROP CONSTRAINT "knowledge_item_reference_id_fkey";
ALTER TABLE "reference_request" DROP CONSTRAINT "reference_request_reference_id_fkey";
ALTER TABLE "knowledge_item" DROP COLUMN "reference_id";
ALTER TABLE "reference_request" DROP COLUMN "reference_id";
DROP TABLE "feature_reference";

-- CreateIndex
CREATE UNIQUE INDEX "feature_benchmark_code_key" ON "feature_benchmark"("code");
CREATE INDEX "feature_benchmark_part_status_idx" ON "feature_benchmark"("part", "status");
CREATE INDEX "feature_benchmark_feature_trgm_idx" ON "feature_benchmark" USING GIN ("feature" gin_trgm_ops);
CREATE INDEX "benchmark_observation_benchmark_id_level_idx" ON "benchmark_observation"("benchmark_id", "level");
CREATE INDEX "benchmark_change_benchmark_id_created_at_idx" ON "benchmark_change"("benchmark_id", "created_at");

-- AddForeignKey
ALTER TABLE "sub_task" ADD CONSTRAINT "sub_task_benchmark_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "feature_benchmark"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_item" ADD CONSTRAINT "knowledge_item_benchmark_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "feature_benchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reference_request" ADD CONSTRAINT "reference_request_benchmark_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "feature_benchmark"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feature_benchmark" ADD CONSTRAINT "feature_benchmark_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feature_benchmark" ADD CONSTRAINT "feature_benchmark_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "benchmark_observation" ADD CONSTRAINT "benchmark_observation_benchmark_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "feature_benchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benchmark_observation" ADD CONSTRAINT "benchmark_observation_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "estimation_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "benchmark_observation" ADD CONSTRAINT "benchmark_observation_actuals_version_id_fkey" FOREIGN KEY ("actuals_version_id") REFERENCES "actuals_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benchmark_observation" ADD CONSTRAINT "benchmark_observation_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "benchmark_change" ADD CONSTRAINT "benchmark_change_benchmark_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "feature_benchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benchmark_change" ADD CONSTRAINT "benchmark_change_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
