# Design

## Context

What already exists:
- **Approved snapshots:** approved versions are frozen in `ApprovedVersion.snapshot` (`src/lib/review/snapshot.ts`). Each snapshot has parts, and each part has Tasks (titled by feature) with Sub tasks in tenths. `knowledgeBaseSources()` already returns each request's latest approved snapshot, and import approval writes one.
- **pgvector:** the extension was enabled in the first migration and is unused so far. `pg_trgm` is used for name search.
- **Tasks:** a Task (`EstimateTask`) is one feature on one part. Saving hours updates Sub tasks in place by id.
- **Actual hours:** `ActualHours` rows record, per version, the part label, Task title, Sub task title and actual tenths.
- **Review:** the attention items (`src/lib/review/attention.ts`) were left open for F-04. Notifications go through one `notify()` in `src/server/review.ts`.
- **Roles:** the Architect role exists. `estimate.approve` covers Tech Leads and Architects.
- **No AI setup yet.** The user chose a **local open-source embedding model**, and **Claude for labelled guesses only when a key is set**. During design the user added: **when there is no reliable match, ask an Architect to add reference hours, and keep them for future matching.**

## Goals / Non-Goals

**Goals:**
- an index of approved Tasks and Architect references with local embeddings
- search with cited sources, and the suggestion order with labels
- the Architect reference loop (ask, answer or decline, index, notify)
- the optional Claude guess
- Accept, Adjust and Reject with stored decisions
- review attention items, settings and tests that don't need a model download or an API key

**Non-Goals:**
- the AI reduction and team experience (F-05)
- adjustments (F-06)
- the full benchmark library with trends (F-24)
- Bedrock and Titan
- Admin-tunable thresholds
- email

## Decisions

### 1. Data model (migration `feature_matching`)

- **`KnowledgeItem`:**
  - `id`, plus one source: `requestId` with `version` (cascade) **or** `referenceId` (cascade)
  - `kind` enum: `APPROVED_PRE_AI`, `APPROVED_AI_ERA`, `ARCHITECT_REFERENCE`
  - `part`, `partLabel`, `title`, `subTasks Json` (`[{title, minTenths, maxTenths, actualTenths?}]`), `minTenths`, `maxTenths`, `actualTenths Int?`
  - `projectName?`, `clientName?`, `authorName?`, `sourceDate`
  - `text` (what was embedded), `model` (which embedder made the vector, so tests and development sharing a database never compare stub and real vectors) and `embedding Unsupported("vector(384)")`. No vector index for now: at Folio3's size (a few thousand Tasks) an exact cosine scan takes milliseconds, and Prisma can't declare an HNSW index without schema drift. Add one in a later migration if the index grows past about 50,000 entries.
  - an index on `(part)`
- **`FeatureReference`:** `id`, `title`, `description`, `part`, `stack String[]`, `subTasks Json`, `authorId`, `createdAt`, `requestId?` (where it was asked from, SetNull).
- **`ReferenceRequest`:**
  - `id`, `requestId` (cascade), `taskId?` (SetNull), `featureName`, `featureDescription`, `part`, `partLabel`, `note`, `askedById`, `architectId`
  - `status` enum: `OPEN`, `ANSWERED`, `DECLINED`
  - `declineReason?`, `referenceId?`, `createdAt`, `answeredAt?`
  - "One open per Task" is checked inside the asking transaction, which locks the Task row first (`SELECT … FOR UPDATE`), since Prisma can't declare partial unique indexes.
- **`TaskSuggestion`** (one current row per Task, replaced on each Find matches):
  - `taskId` (unique, cascade)
  - `method` enum: `ARCHITECT_REFERENCE`, `AI_ERA_ACTUALS`, `PRE_AI_MATCH`, `AI_GUESS`, `NO_MATCH`
  - `matches Json` (the list shown, with ids and similarity)
  - `suggested Json` (Sub tasks, or null), `suggestedMinTenths?`, `suggestedMaxTenths?`
  - `decision` enum: `PENDING`, `ACCEPTED`, `ADJUSTED`, `REJECTED`
  - `reason?`, `decidedById?`, `decidedAt?`, `createdAt`
  - An AI guess is stored in the same row with method `AI_GUESS`.
- **`NotificationKind`** gains `REFERENCE_REQUESTED`, `REFERENCE_ADDED` and `REFERENCE_DECLINED`, so `notify()` handles them.
- **Permission:** `reference.provide`, Architect only. Asking uses `estimate.edit` plus the request edit rules (`canEditRequest`).

### 2. Embeddings (`src/server/matching/embedder.ts`)

- The interface is `embed(texts: string[]): Promise<number[][]>` with a fixed `DIMENSIONS = 384`.
- **`local`:** `@huggingface/transformers` (pinned) with `Xenova/bge-small-en-v1.5` (quantized ONNX, about 35 MB), mean pooling and normalisation.
  - The model is loaded once per process.
  - It's cached in `EMBEDDINGS_CACHE_DIR` (default `./.cache/models`, git-ignored). `npm run embeddings:download` fetches it ahead of time, and the Dockerfile runs that in the build stage, so the running container never downloads.
  - It runs on CPU in Node; a few milliseconds per short text.
- **`stub`:** deterministic hashed bag-of-words vectors (normalised), so similar wording still scores higher. Used by unit, integration and e2e tests and CI, with no download.
- **Text per entry:** `"<part label>: <title>. <description>. Sub tasks: a; b; c"`. For a query: `"<part label>: <feature name>. <description>"`. Built in `src/lib/matching/text.ts` (pure).

### 3. Indexing (`src/server/matching/index.ts`)

- **`indexRequest(db, requestId)`:** reads the latest `ApprovedVersion`, builds one entry per snapshot Task, and attaches actual hours from the latest `ActualsVersion` by `(partLabel, taskTitle, title)`. The kind is `APPROVED_PRE_AI` when the request's baseline is `PRE_AI`, otherwise `APPROVED_AI_ERA`. It embeds the entries, then deletes the request's old entries and inserts the new ones in one transaction.
- **`indexReference(db, referenceId)`** works the same way for one reference.
- **Called:**
  - after `approve` and import `approveProject` commit (embedding stays outside the database transaction)
  - after actuals are saved (`saveManualVersion` and `saveUploadVersion`)
  - after a reference is added
- **If indexing fails, the approval still stands:** the failure is logged, and `reindex-knowledge` repairs the index.
- **`npm run reindex-knowledge`** rebuilds everything. The seed calls it, with the `stub` provider in tests.

### 4. Search and suggestion

- **Search (`src/server/matching/search.ts`):**
  - one SQL query: `SELECT … 1 - (embedding <=> $q) AS similarity FROM knowledge_item WHERE part = $part AND (request_id IS NULL OR request_id <> $self) ORDER BY embedding <=> $q LIMIT 5`, via `$queryRaw` with the vector passed as a text literal
- **The choice is pure (`src/lib/matching/suggest.ts`):**
  - `THRESHOLD = 0.75` for the local model; the stub has its own calibrated value, chosen by the provider
  - among matches at or above the threshold, pick the first available: the best `ARCHITECT_REFERENCE`, then the best AI-era entry **with actual hours** (its actual hours become Min and Max), then the best pre-AI entry
  - otherwise `NO_MATCH`
  - labels and source wording live here too
- **`findMatches(actor, requestId, taskId?)`:** computes and stores the `TaskSuggestion` for one Task or all of them. It needs edit rights. Reads (`getSuggestions`) are open to everyone with a role.

### 5. Architect references (`src/server/matching/references.ts`)

- **`askArchitect(actor, requestId, taskId, { architectId, note })`:**
  - needs edit rights and a `NO_MATCH` suggestion
  - the chosen person must be an active Architect; otherwise "Choose an Architect"
  - creates the request and notifies the Architect
- **`answerReference(actor, id, { title, description, part, stack, subTasks })`:**
  - only the assigned Architect, and only while it's open
  - creates the `FeatureReference`, marks the request `ANSWERED` and notifies the asker
  - then indexes the reference and re-runs `findMatches` for that Task, if it still exists and is editable
- **`declineReference(actor, id, { reason })`:** a reason is required; notifies the asker.
- **`listReferenceRequests(actor)`:** the Architect's open requests and recent answers.

### 6. AI guess (`src/server/matching/ai-guess.ts`)

- **Only when `ANTHROPIC_API_KEY` is set,** using `@anthropic-ai/sdk` (pinned) with model `ANTHROPIC_MODEL` (default `claude-opus-5-5`, with the server-side refusal fallback `fallbacks: "default"`).
- **The prompt holds only this request's details:** application types, the part and its stack, the feature name and description, and the compliance list. It asks for 2–8 Sub tasks with Min/Max hours as AI-era development effort, through a tool or JSON schema, and the result is validated with zod.
- No client name and no other request's data is sent. A unit test checks the prompt builder.
- Errors become "The AI guess failed. Try again or ask an Architect."
- **Tests use an injected fake client;** there's no network in CI.

### 7. Decisions on suggestions

- `decideSuggestion(actor, taskId, { decision, reason? })`:
  - **Accept or Adjust** replaces the Task's Sub tasks with `suggested`, with source comments truncated to 1000 characters, in the same transaction as recording the decision. Adjust needs a reason.
  - **Reject** only records the decision.
- Editing uses the existing lock (`loadForEdit`), so In review and Approved requests are refused.

### 8. UI

- **Estimate page, each Task card:** a "Matches" section.
  - **Before searching:** a "Find matches" button for editors; read-only viewers see stored results.
  - **Results:** the suggestion line (method label, hours, sources) and a table of up to 5 matches (similarity %, source with link, date, part and stack, Min–Max, actual).
  - **Actions:** Accept, Adjust (with an inline reason field) and Reject.
  - **No reliable match:** "Ask an Architect" (Architect select and note), "AI guess" (or "AI guesses aren't set up") and, when open, "Waiting for <name>'s reference".
  - "Find matches for all Tasks" sits in the page header.
- **Reviews page:** gains "Reference hours requested" for Architects, and the sidebar count includes open reference requests. Home "Updates" shows the new notification kinds.
- **`/references/[id]`:** shows the feature as asked (project, part, stack, note), with a form to add Sub tasks with Min/Max, prefilled from the feature name, and a Decline with reason.
- **Review page attention:** new codes `ai-guess`, `no-match` and `waiting-reference`, from the stored suggestions and requests, added by `getReview`.

### 9. Settings

- `env-schema.ts` adds:
  - `EMBEDDINGS_PROVIDER` (`local` or `stub`, default `local`)
  - `EMBEDDINGS_CACHE_DIR` (optional)
  - `ANTHROPIC_API_KEY` (optional, never logged)
  - `ANTHROPIC_MODEL` (optional)
- `.env.example` documents them. `playwright.config.ts` and CI set `EMBEDDINGS_PROVIDER=stub`.

### 10. Testing

- **Unit:**
  - text building, suggestion choice (every order case, threshold edges)
  - the stub embedder (deterministic, similar beats different)
  - the AI prompt builder (no other data), and guess-response validation
  - new attention codes and nav count
- **Integration:**
  - approve → indexed; reopen keeps v1; re-approve replaces; actuals attach
  - search excludes self and filters by part
  - suggestion order with seeded entries, Accept, Adjust and Reject, and the lock
  - ask, answer and decline, with permissions (a non-assigned Architect gets 403, a Tech Lead is refused) and one open request per Task
  - an answered reference matched by a later request
  - AI guess with a fake client, and a clear refusal without a key
- **E2E** (stub embeddings, no key):
  - an estimator finds matches for a Task similar to the seeded "Field service app" and accepts; the Sub tasks show the source comment
  - another Task has no match; the estimator asks Dev Architect; the Architect sees it on Reviews and adds reference hours
  - the estimator sees the update, and the Task's suggestion is the Architect reference
  - "AI guesses aren't set up" is shown
- **One opt-in local-model test** (`MATCHING_LOCAL_MODEL=1`) checks real similarity ordering. It's skipped in CI.

## Risks / Trade-offs

- **Model download and size:** about 35 MB on first use and roughly 150 MB of RAM. It's baked into the image and loaded lazily, and tests use the stub.
- **Threshold calibration:** 0.75 is a starting point. Expect to tune it once real imports exist; it's a single constant, and the Admin setting comes later.
- **Index drift if a hook fails:** the reindex script and logged errors cover it, and approval never fails because indexing did.
- **Architect load:** requests can pile up. They're visible in the sidebar count, and declines carry a reason.
- **Claude guesses are optional and labelled everywhere,** so they can't pass as history.

## Migration Plan

1. Install the pinned dependencies and run migration `feature_matching`.
2. Run `npm run embeddings:download` (Docker does it at build time), then `npm run reindex-knowledge`.
3. Optionally put `ANTHROPIC_API_KEY` in `.env`. No restart is needed beyond the usual one for `.env`.

Rollback: the migration is additive, and old code ignores the new tables.

## Open Questions

- The final similarity threshold, after the first real bulk import.
- Whether Architect references should later need a second Architect's confirmation, as F-24 benchmarks will.
