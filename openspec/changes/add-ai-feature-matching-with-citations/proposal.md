# Proposal

## Why

Estimators still type every hour by hand. The tool's main promise (brief F-04) is to suggest hours for each feature from Folio3's **approved** past work, with a source for every number.

The pieces it needs are now on `main`:
- approved estimates are stored as frozen snapshots (F-10)
- past projects can be imported (F-08)
- delivered projects carry actual hours (F-12)

Matching is next in the release order (brief section 11, step 9), before the AI-era benchmarks (F-24) and the AI reduction (F-05), which build on it.

## What Changes

- **Knowledge index:** each Task (one feature on one part) of every request's latest approved snapshot is indexed, plus every **Architect reference** (below).
  - Indexed: feature title, Sub task titles, part and stack, Min/Max, actual hours where recorded, whether the hours are pre-AI or AI-era, and the source project and version.
  - Each entry gets a **text embedding from a local open-source model** running on the app server. No estimate text leaves Folio3's machines for this.
  - Embeddings are stored with **pgvector**.
  - The index updates when a request is approved, when an import is approved, and when actual hours are saved. `npm run reindex-knowledge` rebuilds it.
- **Find matches** on the estimate page, for one Task or all of them. For each Task the tool shows:
  - **the top 3–5 similar past Tasks**, each with its similarity %, source project, approval date, part and stack, Min/Max, and actual hours if recorded
  - each with a **link** to the source estimate
- **A suggested Min/Max per Task, with its method always shown.** Among matches above the similarity threshold, the first of:
  1. an **Architect reference** (Architect-confirmed, AI-era)
  2. **AI-era actual hours** from similar delivered work
  3. an **approved AI-era estimate** (made in this tool, no actual hours yet)
  4. the best **pre-AI match**, shown **unreduced** and labelled "Pre-AI hours: the AI reduction isn't applied yet" until F-05
  - Stack and compliance adjustments (F-06) come later. AI-era benchmarks (F-24) can grow from Architect references.
- **When no match reaches the threshold: "No reliable match".** The editor can then:
  - **Ask an Architect** for reference hours: pick an active Architect and add an optional note. The Architect is notified in the app (Reviews page, Home and the sidebar count).
  - **The Architect answers:** they enter the feature's Sub tasks with Min/Max for that part and stack, or decline with a reason.
    - An added reference is stored as an **Architect reference** and indexed at once, so it's matched for this Task and for **every future request** with a similar feature.
    - The person who asked is notified, and the Task's suggestion becomes the reference.
  - **Optionally get a Claude guess** while waiting, labelled **"AI-generated, no historical reference"**, if an Anthropic API key is set. Without a key there are no guesses.
- **Accept, Adjust (with a reason) or Reject** each suggestion.
  - Accepting fills the Task's Sub tasks from the source, each with a comment naming its source ("From Patient portal MVP v1, Backend (Node.js)", "From Architect reference by Dev Architect") or "AI-generated, no historical reference". The note travels to the Excel export as is.
  - The decision, its method, sources and suggested hours are stored. Nothing is applied without a click.
- **Review integration:** the review page's "Needs your attention" adds **AI guesses**, **"No reliable match"** Tasks and Tasks **waiting for an Architect's reference** (the F-10 extension point).
- **Settings and safety:**
  - `EMBEDDINGS_PROVIDER` is `local` by default, or `stub` for tests.
  - `ANTHROPIC_API_KEY` is optional and goes in `.env` only. `ANTHROPIC_MODEL` is optional.
  - Only the request's own feature text is sent to Claude, never other clients' estimates.

**Out of scope:**
- AI-era benchmarks (F-24) and the AI reduction with team experience (F-05)
- stack, compliance and environment adjustments (F-06)
- document upload (F-09)
- email
- Amazon Titan/Bedrock embeddings (the embedder interface allows them later)
- Admin settings for the threshold (it's a constant for now)

## Capabilities

### New Capabilities
- `feature-matching`:
  - the knowledge index from approved snapshots and Architect references, and similarity search with sources
  - asking an Architect for reference hours, and the Architect's answer, stored for future matching
  - the suggestion order and its labels, "No reliable match", and the labelled Claude guess
  - Accept, Adjust and Reject with stored decisions, source notes on Sub tasks
  - the review attention items for AI guesses and no-match Tasks, and the privacy rules for AI calls

### Modified Capabilities
- None. The review page's extra attention items are specified in `feature-matching`, so this change doesn't depend on the `estimate-review` archive (pull request 15) landing first.

## Impact

- **Dependencies:**
  - `@huggingface/transformers` (local embeddings, ONNX); the model is downloaded once and cached, and baked into the Docker image
  - `@anthropic-ai/sdk`
  - both pinned
- **Prisma** (migration `feature_matching`):
  - `KnowledgeItem`, with a `vector(384)` column
  - `TaskSuggestion`, plus its method and decision enums
  - `FeatureReference` (an Architect's reference hours) and `ReferenceRequest` (asked, answered or declined)
  - new notification kinds for reference requests and answers
  - a `reference.provide` permission (Architect)
- **Server:**
  - new `src/server/matching/`: embedder, index, search, suggest, ai-guess
  - hooks in `review.ts` (approve), `import.ts` (approve) and `actuals.ts` (save) to update the index
  - `src/lib/review/attention.ts` gains two codes
- **Pure logic:** `src/lib/matching/` builds the index text, chooses the suggestion, and holds the labels and threshold.
- **UI:**
  - a matches panel on each Task card of the estimate page, plus "Find matches for all Tasks", "Ask an Architect" and "AI guess"
  - a "Reference hours requested" list on the Reviews page for Architects, and an answer page (`/references/[id]`)
  - attention items on the review page
- **Settings:** `src/lib/env-schema.ts`, `.env.example` and the README gain the new optional settings; Playwright and CI use `EMBEDDINGS_PROVIDER=stub`.
- **Scripts:** `reindex-knowledge`, and `embeddings:download` (used in the Dockerfile).
