#!/usr/bin/env bash
# Exports the local database for production, without anything the automated tests or the
# development seed made. Works on a temporary copy (f3_export); the source database is only
# read. Writes local-data/deploy/f3_estimation-<date>.dump (git-ignored; it holds client data).
#
#   bash deploy/export-data.sh            # from the project folder, with the local db running
#
# What stays: requests owned by real people (not the dev.*/it.*/e2e.* test accounts) and their
# documents, questions and reviews; people; the technology catalog; estimate defaults; the
# feature-hours list with its pre-AI hours. What goes: test-made requests, benchmarks and
# observations; AI-era hours and confirmations that came only from test or sample data;
# test-only search-index entries; sessions; the email log. Test accounts are kept as
# deactivated rows (so history still resolves) without passwords.
set -euo pipefail

CONTAINER="${DB_CONTAINER:-openspec-project-db-1}"
SOURCE="${SOURCE_DB:-f3_estimation}"
COPY="f3_export"
OUT_DIR="local-data/deploy"
OUT="$OUT_DIR/f3_estimation-$(date +%Y%m%d-%H%M).dump"
TEST_USERS="^(dev|it|e2e|pinvite|boot)\\."

sql() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U f3 -q "$@"; }

echo "Copying $SOURCE to $COPY..."
sql -d postgres -c "DROP DATABASE IF EXISTS $COPY"
sql -d postgres -c "CREATE DATABASE $COPY"
docker exec "$CONTAINER" sh -c "pg_dump -U f3 -Fc $SOURCE > /tmp/source.dump && pg_restore -U f3 -d $COPY --no-owner /tmp/source.dump && rm /tmp/source.dump"

echo "Removing test data from the copy..."
sql -d "$COPY" <<SQL
BEGIN;
CREATE TEMP TABLE test_user AS SELECT id FROM "user" WHERE email ~ '$TEST_USERS';

-- Requests made by tests or the development seed (cascades to features, tasks, documents...).
DELETE FROM estimation_request WHERE owner_id IN (SELECT id FROM test_user);
DELETE FROM client c WHERE NOT EXISTS (SELECT 1 FROM estimation_request r WHERE r.client_id = c.id);

-- Feature hours: drop test-made benchmarks and every observation and log entry by a test
-- account, then reset AI-era hours that only those observations or the seed samples produced.
DELETE FROM feature_benchmark WHERE created_by_id IN (SELECT id FROM test_user);
DELETE FROM benchmark_observation WHERE created_by_id IN (SELECT id FROM test_user);
DELETE FROM benchmark_change WHERE actor_id IN (SELECT id FROM test_user);
UPDATE feature_benchmark b SET experienced_tenths = NULL, junior_tenths = NULL, projects_count = 0,
       status = 'DRAFT', confirmed_by_id = NULL, confirmed_at = NULL, ai_tools = ''
 WHERE NOT EXISTS (SELECT 1 FROM benchmark_observation o WHERE o.benchmark_id = b.id);

-- Search index: test-only "stub" vectors, and benchmark entries (no benchmark has AI-era hours
-- left to match on).
DELETE FROM knowledge_item WHERE model = 'stub' OR benchmark_id IS NOT NULL;

-- Test accounts: no passwords, no sessions, no sign-in. Everyone signs in again in production.
UPDATE "user" SET status = 'DEACTIVATED' WHERE id IN (SELECT id FROM test_user);
DELETE FROM account WHERE provider_id = 'credential' AND user_id IN (SELECT id FROM test_user);
DELETE FROM session;
DELETE FROM role_invitation WHERE email ~ '$TEST_USERS';
DELETE FROM email_message;
COMMIT;
SQL

echo "Writing $OUT..."
mkdir -p "$OUT_DIR"
docker exec "$CONTAINER" sh -c "pg_dump -U f3 -Fc --no-owner --no-privileges $COPY > /tmp/export.dump"
docker cp "$CONTAINER:/tmp/export.dump" "$OUT"
docker exec "$CONTAINER" sh -c "rm /tmp/export.dump"

echo "What the export holds:"
sql -d "$COPY" -t -A -F ' ' -c "
  SELECT 'requests', count(*) FROM estimation_request
  UNION ALL SELECT 'features', count(*) FROM feature
  UNION ALL SELECT 'documents', count(*) FROM request_document
  UNION ALL SELECT 'active people', count(*) FROM \"user\" WHERE status = 'ACTIVE'
  UNION ALL SELECT 'feature-hours entries', count(*) FROM feature_benchmark
  UNION ALL SELECT 'technologies', count(*) FROM technology"
sql -d postgres -c "DROP DATABASE $COPY"
echo "Done: $OUT"
