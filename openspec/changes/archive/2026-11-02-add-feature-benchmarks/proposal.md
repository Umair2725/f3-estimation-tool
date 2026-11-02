# Proposal

## Why

AI tools keep making Folio3's developers faster, so past (pre-AI) estimates and fixed reduction percentages fall further behind every quarter. The brief's answer (F-24) is a **benchmark library**: the hours the team actually spends with AI on common features, confirmed by a Tech Lead or Architect, and kept current from new evidence. These hours are offered first in every estimate.

Matching (F-04) is now on `main`, and it already has an "Architect reference" for features with no match. That's a one-off benchmark. This change makes it the general mechanism. It comes next in the release order (brief section 11, step 10), before the AI reduction (F-05), which is the fallback when no benchmark exists.

## What Changes

- **Benchmark library**: Knowledge base → **Feature hours**, open to everyone with a role. One row per feature, per part and, optionally, per stack:
  - ID (`FB-001`…), module, feature, part, typical stack, and what one instance includes
  - pre-AI Min/Max with their source, for comparison only
  - **AI-era hours for an experienced developer (→ Min) and a junior developer (→ Max)**
  - AI tools used, "based on N projects", status (**Draft / Confirmed / Retired**), who confirmed it and when, and notes
  - Parts include **Design** and **Any** as well as the five estimate parts.
- **Import** (Admins): the seed CSV (`data/feature-benchmarks.csv`, 166 features) or the filled-in survey workbook (`data/feature-hours-survey.xlsx`).
  - Rows are matched by ID, so new IDs are added and existing ones updated.
  - It's a preview first, and nothing is saved until the Admin applies it.
  - AI-era hours in the file become **observations**. A "Confirmed by" name in the file is kept as a note, because only a Tech Lead or Architect can confirm in the tool.
- **Edit and confirm:**
  - Tech Leads, Architects and Admins can add and edit benchmarks.
  - **Only a Tech Lead or Architect can confirm one.** Editing the hours of a Confirmed benchmark sends it back to Draft.
  - Admins and Architects can retire a benchmark.
- **Observations**: each one is a real number of hours for a feature, with a level (experienced, junior or mixed), a date, the AI tools, an optional project and who entered it.
  - **Manual:** Tech Leads and Architects enter them on the benchmark.
  - **From actual hours:** when actuals are saved for a delivered **AI-era** project, the Tech Lead picks the **team level** (experienced, junior or mixed). Each Sub task linked to a benchmark then adds an observation. Mixed observations are recorded but not used to recalculate.
- **Recalculation**: experienced and junior hours are a weighted mean of their observations, with the last 6 months counting double.
  - Changes to a Draft apply directly.
  - Changes to a **Confirmed** benchmark of more than **±15%** are **proposed to an Architect**, who accepts or rejects. Smaller ones apply and are logged.
  - **Every change to a benchmark's hours is logged** with its cause (import, edit, recalculation, proposal) and traceable to its observations.
- **Trend**: each benchmark shows its pre-AI estimate and its AI-era hours over time.
- **Architect references become Draft benchmarks.** Answering a request for reference hours creates a Draft benchmark, with the Sub task breakdown kept. Existing references are converted.
- **Matching uses benchmarks first.** Benchmarks with AI-era hours are indexed, and the suggestion order becomes:
  1. a **Confirmed benchmark** ("Benchmark FB-012, confirmed by …, based on 4 projects, updated 2026-09")
  2. a Draft benchmark ("not confirmed yet")
  3. AI-era actual hours
  4. an approved AI-era estimate
  5. a pre-AI match
  - A benchmark without AI-era hours is never suggested.
  - Accepting a benchmark suggestion **links the Sub tasks to the benchmark**, so their actual hours can flow back after delivery.
- **Reviews page** lists benchmark changes waiting for an Architect, included in the sidebar count. The seed imports the 166-feature CSV plus a few clearly labelled development sample values.

**Out of scope:**
- the AI reduction factors and the request's team experience setting (F-05)
- a sparkline chart (the trend is a table for now)
- Admin settings for the 15% threshold and the 6-month window (constants for now)
- writing the survey workbook back out

## Capabilities

### New Capabilities
- `feature-benchmarks`:
  - the library and its fields
  - import from CSV or the survey workbook
  - editing, confirmation and retirement, with their permissions
  - observations (manual and from actual hours), recalculation, proposals over the threshold, the change log and the trend

### Modified Capabilities
- `feature-matching`: the index includes benchmarks with AI-era hours instead of Architect references. The suggestion order starts with Confirmed and then Draft benchmarks. Matches and source comments name the benchmark. An Architect's reference hours are stored as a Draft benchmark. Accepting a benchmark suggestion links the Sub tasks to it.
- `actual-hours`: saving actual hours for a delivered AI-era project asks for the team level, which turns linked Sub tasks into benchmark observations.

## Impact

- **Prisma** (migration `feature_benchmarks`):
  - `FeatureBenchmark`, `BenchmarkObservation` and `BenchmarkChange`
  - enums `BenchmarkPart`, `BenchmarkStatus`, `DeveloperLevel`, `ObservationSource` and `BenchmarkChangeKind`
  - `SubTask.benchmarkId` and `ActualsVersion.teamLevel`
  - `ReferenceRequest.benchmarkId` replaces `referenceId`; `KnowledgeItem.benchmarkId` replaces `referenceId`
  - `FeatureReference` rows are converted to Draft benchmarks and the table is dropped
  - Knowledge kinds become `BENCHMARK_CONFIRMED` and `BENCHMARK_DRAFT` instead of `ARCHITECT_REFERENCE`
  - Permissions: `benchmark.edit` (Tech Lead, Architect, Admin), `benchmark.confirm` (Tech Lead, Architect), `benchmark.decide` (Architect) and `benchmark.retire` (Architect, Admin); importing uses `settings.manage`
- **Server:**
  - new `src/server/benchmarks/`: library, import, observations and recalculation, proposals
  - `matching.ts` and `knowledge.ts` adapt to benchmarks; `actuals.ts` gains the team level and observations
- **Pure logic:** `src/lib/benchmarks/`: CSV and survey row parsing, the weighted recalculation, the threshold rule, labels.
- **UI:**
  - new pages: `/benchmarks`, `/benchmarks/[id]`, `/benchmarks/import`
  - the sidebar's "Feature hours" becomes a link
  - the Reviews page gets a proposals list, and saving actuals asks for the team level
  - match lines and the reference answer page are reworded
- **Seed:** imports `data/feature-benchmarks.csv`.
