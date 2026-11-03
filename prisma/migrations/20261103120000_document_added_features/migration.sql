-- Which feature each proposal feature item was added as (specs/requirement-documents
-- "Removed features offered again"). Additive; existing rows start empty.
ALTER TABLE "request_document" ADD COLUMN "added_features" JSONB NOT NULL DEFAULT '{}';
