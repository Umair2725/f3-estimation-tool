# Tasks

## 1. Setup and data model

- [x] 1.1 Add the pinned `@huggingface/transformers` and `@anthropic-ai/sdk` dependencies. Add `EMBEDDINGS_PROVIDER`, `EMBEDDINGS_CACHE_DIR`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` to `env-schema.ts`, `.env.example` and the env tests, and git-ignore `.cache/`. Set `EMBEDDINGS_PROVIDER=stub` in `playwright.config.ts` and CI. Verify that `npm ci`, `check-env` and the env unit tests pass.
- [x] 1.2 Add `KnowledgeItem` (with `vector(384)`), `FeatureReference`, `ReferenceRequest`, `TaskSuggestion`, the new enums and notification kinds, and the `reference.provide` permission. Create the migration, then verify `db:deploy` on a fresh database and that there's no drift.

## 2. Pure logic

- [x] 2.1 Implement `src/lib/matching/text.ts` (entry and query texts) and `src/lib/matching/suggest.ts` (order, threshold, labels, source wording). Verify unit tests for every order case and the threshold edges.
- [x] 2.2 Implement the embedder (`local` with `Xenova/bge-small-en-v1.5`, lazily loaded and cached; `stub`, deterministic) and `npm run embeddings:download`. Verify unit tests for the stub, plus an opt-in local-model test (`MATCHING_LOCAL_MODEL=1`) that ranks a close title above an unrelated one.

## 3. Server

- [x] 3.1 Implement indexing: `indexRequest` (latest approved version, actual hours attached, AI-era or pre-AI kind) and `indexReference`. Hook them after approve, import approval and actuals save, failing softly with a log. Add `npm run reindex-knowledge`, called from the seed. Verify integration tests: approve indexes, reopen keeps v1, re-approve replaces, actuals attach, and the rebuild leaves no stale entries.
- [x] 3.2 Implement search and `findMatches` / `getSuggestions` (same part, the request itself excluded, top 5, stored `TaskSuggestion`). Verify integration tests: the suggestion order with seeded entries, and edit rights for finding matches.
- [x] 3.3 Implement `decideSuggestion` (Accept and Adjust replace Sub tasks with source comments; Adjust needs a reason; Reject records only; the existing lock applies). Verify integration tests for each decision and for In review refused.
- [x] 3.4 Implement Architect references: ask (an active Architect only; one open per Task; notify), answer (the assigned Architect only; create and index the reference; re-match the Task; notify) and decline (a reason is required; notify). Add `listReferenceRequests`. Include open reference requests in the Reviews count. Verify integration tests for permissions, notifications, and a later request matching the answered reference.
- [x] 3.5 Implement the optional AI guess: the prompt builder with only this request's data, the SDK call with structured output validated by zod, an injectable client, and a clear refusal without a key. Verify unit tests for the prompt contents and integration tests with a fake client.
- [x] 3.6 Extend the review attention with `ai-guess`, `no-match` and `waiting-reference` (from stored suggestions and open requests). Verify unit and integration tests.

## 4. Pages

- [x] 4.1 Estimate page: a Matches section on each Task card (suggestion line, matches table with links, Accept, Adjust with reason, Reject, Ask an Architect, AI guess or "AI guesses aren't set up", waiting state), plus "Find matches for all Tasks".
- [x] 4.2 Reviews page: "Reference hours requested" for Architects. Add the `/references/[id]` answer page (feature as asked, a Sub task form prefilled from the feature, Decline with reason). Show the new notification kinds on Home.
- [x] 4.3 Seed: index the seeded approved request ("Field service app") so matching works in the demo. Update the README with a "Matching" section, the new settings, `reindex-knowledge` and `embeddings:download`. Make the Dockerfile download the model at build time.

## 5. Checks

- [x] 5.1 E2E `e2e/matching.spec.ts` (stub embeddings, no key; run as the Admin so other specs' Estimator drafts are undisturbed): find matches and accept from "Field service app" (the source comment shows); a no-match Task → ask Dev Architect → the Architect adds reference hours on `/references/[id]` → the Admin sees the update, and the suggestion is the Architect reference; "AI guesses aren't set up" is shown.
- [x] 5.2 Run the full local check (format, lint, typecheck, unit, integration, build, e2e), all passing. Also run the opt-in local-model test once and record its result in the PR.
- [x] 5.3 Verify CI is green on the pull request.
