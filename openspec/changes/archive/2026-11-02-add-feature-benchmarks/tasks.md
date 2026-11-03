# Tasks

## 1. Data model

- [x] 1.1 Add the benchmark enums, `FeatureBenchmark`, `BenchmarkObservation`, `BenchmarkChange`, `SubTask.benchmarkId` and `ActualsVersion.teamLevel`. Switch `ReferenceRequest` and `KnowledgeItem` to `benchmarkId`, and update the knowledge and suggestion enums. Write the SQL conversion of `feature_reference` rows into Draft benchmarks (FB-9001 up) before dropping the table. Add the `benchmark.*` permissions. Verify `db:deploy` on a fresh database and on a database with references, that there's no drift, and the permission matrix test.

## 2. Pure logic

- [x] 2.1 Implement `src/lib/benchmarks/rows.ts` (CSV and survey rows → benchmark rows with problems, part mapping). Verify unit tests, including quoted commas, every part name, bad numbers and Min > Max, and that the seed CSV parses to 166 rows with no problems.
- [x] 2.2 Implement `src/lib/benchmarks/recalc.ts` (weighted mean, rounding, the threshold decision, projects count) and `labels.ts`. Verify unit tests for the spec examples (4.5 h; -25% proposed; -12.5% applied; a Draft always applied).

## 3. Server

- [x] 3.1 Implement the library service: list, get (with observations, changes, proposal and trend), create, update (a Confirmed one returns to Draft when its hours change), confirm and retire, each with its permission. Verify integration tests for every permission and the Draft rule.
- [x] 3.2 Implement observations and recalculation (manual add; apply, propose or none; the change log with observation ids) and proposals (list, accept, reject; Architects only). Verify integration tests.
- [x] 3.3 Implement the import (preview for CSV and xlsx, then apply; Survey observations; the confirmed-by note; Admin only). Verify integration tests: the seed CSV gives 166 Draft benchmarks, and a survey fixture with hours gives observations and recalculated hours.
- [x] 3.4 Actuals: the required team level for AI-era requests, and observations from benchmark-linked Sub tasks (replaced per version; mixed is stored but not used; nothing for pre-AI). Verify integration tests.
- [x] 3.5 Matching: index benchmarks (only usable ones, part Any matches all, Design never), the new suggestion order and labels, benchmark Sub tasks (breakdown scaled, or one Sub task), accept writes `SubTask.benchmarkId`, and an Architect's answer creates a Draft benchmark. Update the existing matching tests, and add tests for a Confirmed benchmark first and for the link.

## 4. Pages

- [x] 4.1 `/benchmarks` (search and filters) and `/benchmarks/[id]` (details, edit, confirm, retire, proposal, observations, log, trend). The sidebar's "Feature hours" becomes a link.
- [x] 4.2 `/benchmarks/import` (upload, preview, apply) for Admins.
- [x] 4.3 The Reviews page: "Benchmark changes to confirm" for Architects, plus the count. The actuals editor and upload review get the Team level select. Update the matching UI labels and links, and the reference answer page wording.
- [x] 4.4 Seed: import the CSV, add the development sample observations, and confirm one by Dev Architect. Update the README with a "Feature hours" section.

## 5. Checks

- [x] 5.1 E2E `e2e/benchmarks.spec.ts`: an Admin imports the seed CSV (preview → apply); a Tech Lead adds an observation and confirms; a request Task gets "Benchmark FB-…, confirmed by …" and accepting it links the Sub task; an observation over 15% creates a proposal that an Architect accepts.
- [x] 5.2 Run the full local check (format, lint, typecheck, unit, integration, build, e2e twice), all passing.
- [x] 5.3 Verify CI is green on the pull request.
