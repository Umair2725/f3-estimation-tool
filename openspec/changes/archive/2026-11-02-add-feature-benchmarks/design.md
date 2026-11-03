# Design

## Context

What already exists:
- **Matching (F-04):** a knowledge index (`KnowledgeItem`, pgvector, local embeddings) of approved Tasks and **Architect references** (`FeatureReference`, created when an Architect answers a `ReferenceRequest`). The pure choice `chooseSuggestion` ranks Architect reference → AI-era actuals → AI-era estimate → pre-AI.
  - Accepting a suggestion copies its Sub tasks with a source comment.
  - Entries record their embedder (`model`), so stub and local vectors coexist.
- **Actual hours (F-12):** `ActualsVersion` / `ActualHours` rows link to `SubTask` by `subTaskId`. Requests carry `baseline` (`PRE_AI` for imports, `AI_ERA` otherwise).
- **Seed data:** `data/feature-benchmarks.csv` (166 rows) and `data/feature-hours-survey.xlsx` (Features sheet: header in row 1, column B onward, the same columns as the CSV with display names). The CSV's part values include `Design` and `Any`, which `ProjectPart` lacks.
- **User decisions:**
  - Architect references **become Draft benchmarks**.
  - Actuals **ask for the team level** (experienced, junior or mixed) when saved, and mixed is recorded but not used.

## Goals / Non-Goals

**Goals:**
- the benchmark library, with import (CSV and survey) behind a preview
- edit, confirm and retire with permissions
- observations, weighted recalculation, proposals over 15%, the change log and the trend
- matching with benchmarks first and Sub tasks linked to them; actuals feeding observations
- references converted to benchmarks

**Non-Goals:**
- F-05 reduction factors and team experience on requests
- Admin-tunable threshold and window
- charts
- survey export
- benchmark merge or de-duplication tools

## Decisions

### 1. Data model (migration `feature_benchmarks`)

- **Enums:**
  - `BenchmarkPart`: `WEB_FRONTEND`, `BACKEND`, `ADMIN_PANEL`, `MOBILE`, `CLOUD_INFRA`, `DESIGN`, `ANY`
  - `BenchmarkStatus`: `DRAFT`, `CONFIRMED`, `RETIRED`
  - `DeveloperLevel`: `EXPERIENCED`, `JUNIOR`, `MIXED`
  - `ObservationSource`: `MANUAL`, `SURVEY`, `ACTUALS`
  - `BenchmarkChangeKind`: `IMPORT`, `EDIT`, `RECALCULATED`, `PROPOSED`, `PROPOSAL_ACCEPTED`, `PROPOSAL_REJECTED`, `CONFIRMED`, `RETIRED`, `REFERENCE`
- **`FeatureBenchmark`:**
  - `id`, `code` (unique, `FB-012`), `module`, `feature`, `part BenchmarkPart`, `stack` (default "Any"), `included`
  - `preAiMinTenths?`, `preAiMaxTenths?`, `preAiSource?`
  - `experiencedTenths?`, `juniorTenths?`, `aiTools`, `projectsCount Int @default(0)`
  - `status`, `confirmedById?`, `confirmedAt?`, `notes`
  - `breakdown Json?` (Sub tasks `[{title, minTenths, maxTenths}]`, from Architect references)
  - `createdById`, `createdAt`, `updatedAt`
- **`BenchmarkObservation`:**
  - `id`, `benchmarkId` (cascade), `level`, `hoursTenths`, `observedOn` (date), `source`, `aiTools`, `note`
  - `requestId?` (SetNull), `actualsVersionId?` (cascade, so a replaced version's observations go with it), `createdById?`, `createdAt`
- **`BenchmarkChange`:**
  - `id`, `benchmarkId` (cascade), `kind`
  - `fromExperienced?`, `fromJunior?`, `toExperienced?`, `toJunior?`
  - `observationIds String[]`, `note`, `actorId?` (null for automatic recalculation), `createdAt`
  - A pending proposal is the latest `PROPOSED` change without a later `PROPOSAL_ACCEPTED` or `PROPOSAL_REJECTED`. Its proposed values live in `to*`. This keeps one table for the log and the queue.
- **Other models:**
  - `SubTask.benchmarkId?` (SetNull)
  - `ActualsVersion.teamLevel DeveloperLevel?`
- **Matching tables:**
  - `ReferenceRequest.benchmarkId?` replaces `referenceId`
  - `KnowledgeItem.benchmarkId?` replaces `referenceId`
  - `KnowledgeKind` adds `BENCHMARK_CONFIRMED` and `BENCHMARK_DRAFT` and drops `ARCHITECT_REFERENCE`
  - `SuggestionMethod` adds `BENCHMARK_CONFIRMED` and `BENCHMARK_DRAFT` and drops `ARCHITECT_REFERENCE`
- **Data migration (SQL in the same migration):**
  - Each `feature_reference` row becomes a Draft benchmark with code `FB-` and the next number from 9001 up, in creation order. `part` is mapped from `ProjectPart`, `stack` is the joined stack, `breakdown` is its Sub tasks, and experienced/junior are the summed Min/Max. Each gets a `REFERENCE` change.
  - `reference_request.benchmark_id` is filled from the mapping.
  - Knowledge rows of the removed kind are deleted.
  - Suggestions stored with method `ARCHITECT_REFERENCE` become `BENCHMARK_DRAFT`, so the enum value can be dropped.
  - `feature_reference` is dropped.
  - `npm run reindex-knowledge` restores the index.
  - Rows numbered 9001 up stay separate from the seed list's `FB-001`…`FB-166`. New benchmarks take the next number above the highest existing one under 9000, and references keep taking 9001 up, so the two ranges never collide.

### 2. Pure logic (`src/lib/benchmarks/`)

- **`rows.ts`:** parses CSV text (RFC 4180 quotes, header names) and survey rows (by header names) into `BenchmarkRow` objects, with per-row problems:
  - unknown part, non-numeric hours, Min > Max, missing ID or feature
  - part names map: "Web/Frontend" → `WEB_FRONTEND`, …, "Any" → `ANY`
  - The CSV is parsed by a small local parser, with no new dependency.
- **`recalc.ts`:**
  - `weightedHours(observations, level, now)`: weight 2 within 183 days, else 1, rounded to 0.5 h (5 tenths); `null` when there are none
  - `decide(current, next, status)`: `apply`, `propose` (Confirmed and |Δ| > 15% on either level), or `none`
  - `projectsCount(observations)`
- **`labels.ts`:** status labels and the suggestion source wording ("Benchmark FB-012, confirmed by …, based on 4 projects, updated 2026-09").

### 3. Server (`src/server/benchmarks/`)

- **`benchmarks.ts`:**
  - `listBenchmarks(actor, filters)`, `getBenchmark` (with observations, changes, pending proposal and trend)
  - `createBenchmark`, `updateBenchmark` (a Confirmed one returns to Draft when its hours change), `confirmBenchmark`, `retireBenchmark`
  - `addObservation` (then recalculates), `decideProposal(actor, id, accept)`, `listProposals` (Architects)
  - Each write re-indexes the benchmark's knowledge entry (`indexBenchmark`), failing softly as F-04's hooks do.
- **`import.ts`:**
  - `previewImport(actor, file)`: CSV or xlsx, Admin only, returning new, changed, unchanged and problem rows. Stateless: nothing is stored, and Apply sends the same file again (both are well under the 1 MB server-action limit).
  - `applyImport(actor, id)`: one transaction, a change row per changed benchmark, and Survey observations for AI hours, then a recalculation
- **`observations.ts`:**
  - `recalculate(tx, benchmarkId, cause)` applies `decide`
  - `observationsFromActuals(tx, versionId)` is called from `saveManualVersion` and `saveUploadVersion` after the version is created. It deletes the request's older-version observations and adds new ones for Sub tasks with `benchmarkId` and actual hours, unless the version's level is `MIXED` (stored, not used).
- **Actuals:**
  - `createVersion` takes `teamLevel`
  - Both save functions require it when the request's baseline is `AI_ERA` ("Choose the team level"), and ignore it for `PRE_AI`.

### 4. Matching changes

- **Index:**
  - `knowledge.ts` replaces `indexReference` with `indexBenchmark(db, embedder, id)`.
  - An entry is written only when the benchmark is usable (experienced hours, not Retired); otherwise the entry is deleted.
  - Text: `"<part label>: <feature>. <included>. Sub tasks: …"`. `part` stores the estimate part, or for `DESIGN`/`ANY` a null-part flag.
- **Search:** `searchKnowledge` adds `OR any_part` so benchmarks with part Any match every part. `DESIGN` benchmarks never match, because there is no Design part in estimates yet.
- **Choice:** `chooseSuggestion` order: `BENCHMARK_CONFIRMED`, `BENCHMARK_DRAFT`, AI-era actuals, AI-era estimate, pre-AI.
  - **Benchmark Sub tasks:** use the breakdown scaled to the benchmark's current experienced/junior totals; with no breakdown, one Sub task named after the feature with Min = experienced, Max = junior.
  - **Comment:** "From benchmark FB-012". The suggested Sub tasks carry `benchmarkId`, which `decideSuggestion` writes to `SubTask.benchmarkId`.
- **Match rows:** carry `benchmarkCode`, `status`, `confirmedByName`, `projectsCount` and `updatedAt` for labels and links.
- **References:** `answerReference` creates a Draft benchmark (`REFERENCE` change) instead of a `FeatureReference`, then indexes it and re-matches the Task. The answer page wording says the hours become a Draft benchmark.

### 5. Pages

- **`/benchmarks`:** a searchable, filterable table (module, part, status, has AI hours) and a "New benchmark" button (editors). Admins get "Import".
- **`/benchmarks/[id]`:**
  - details, an edit form (editors), Confirm (Tech Lead, Architect) and Retire (Architect, Admin)
  - a pending proposal with Accept/Reject (Architect)
  - observations, with an add form (Tech Lead, Architect)
  - the change log, and the trend table (pre-AI → each AI-era value by date)
- **`/benchmarks/import`:** upload, a preview table (new / changed / unchanged / problems), then Apply.
- **Elsewhere:**
  - sidebar "Feature hours" → `/benchmarks`
  - the Reviews page gets "Benchmark changes to confirm" for Architects, and `reviewCount` adds pending proposals for Architects
  - the actuals editor and upload review get a required "Team level" select for AI-era projects
  - matching UI labels come from `METHOD_LABELS` and links go to `/benchmarks/[id]`

### 6. Seed and tests

- **Seed:** imports `data/feature-benchmarks.csv` through the same import code (idempotent by ID). It then adds development sample values to three benchmarks (for example FB-012) as Survey observations with the note "Development sample, not real data", and confirms one by Dev Architect, so matching shows a Confirmed benchmark in the demo.
- **Unit:** row parsing (CSV quotes, part mapping, problems), the weighted mean and rounding, the threshold decision, labels, and the new suggestion order.
- **Integration:**
  - the import preview and apply (the seed CSV gives 166 Draft benchmarks; survey hours give observations; the confirmed-by note)
  - permissions
  - confirm, and edit-returns-to-Draft
  - observation → recalculation, and a proposal over 15% accepted and rejected
  - actuals with a team level → observations replaced on version 2; mixed is not used; pre-AI asks nothing
  - matching: a Confirmed benchmark first, and accept links Sub tasks
  - an Architect answer → a Draft benchmark
  - the migration's reference conversion, checked against a fixture inserted before running
- **E2E:**
  - an Admin imports the CSV (preview → apply)
  - a Tech Lead adds hours and confirms
  - an estimator's Task gets "Benchmark FB-…, confirmed by …" and accepts it, with the Sub task linked
  - an Architect accepts a proposal created by observations

## Risks / Trade-offs

- **The migration converts and drops a table.** Only development data exists today. The conversion is in SQL and covered by a test, and `reindex-knowledge` rebuilds the index afterwards.
- **Weighting is simple** (two tiers): easy to explain and to tune later.
- **DESIGN benchmarks** aren't matched until estimates get a Design part. They're kept for the library and the survey.
- **Survey numbers are self-reported.** Confirmation by a Tech Lead or Architect and the proposal threshold guard against outliers.

## Migration Plan

1. Run migration `feature_benchmarks` (converts any references), then `npm run reindex-knowledge`.
2. An Admin imports `data/feature-benchmarks.csv`. When Tech Leads return the survey, import `feature-hours-survey.xlsx`.

Rollback: restore from backup; the reference table is dropped.

## Open Questions

- The final threshold (15%) and recency window (6 months), once real observations arrive.
- When to add a Design part to estimates, so `DESIGN` benchmarks can be matched.
