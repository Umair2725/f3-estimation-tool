# Design

## Context

- **Wizard:** four steps (Project; Platforms & stack; Environment & compliance; Requirements) saved by `saveStep` in `src/server/estimation-requests.ts`. The data lives in:
  - `EstimationRequest` (project fields, `applicationTypes`, `operatingSystems`, `browsers`, `considerations` JSON validated by `considerationsSchema`)
  - `RequestPart` (part, technologies, `assumptions[]`, `risks[]`)
  - `Feature` (name, description, `parts[]`, position)
  - `syncTasks(tx, requestId)` creates one `EstimateTask` per feature and part
  - `canEditRequest`/`loadForEdit` decide who may change a request (owner or Admin, while Draft or Changes requested)
- **Placeholder:** the Requirements step (`src/app/(app)/estimates/wizard/steps.tsx`) shows "Document upload (PDF or DOCX) is coming soon".
- **Matching:** `computeSuggestions(requestId, taskIds?)` in `src/server/matching/matching.ts` fills suggestions. `findMatches` wraps it with a permission check.
- **Existing Claude call:** `src/server/matching/ai-guess.ts`:
  - `@anthropic-ai/sdk` 1.3.0, `client.beta.messages.parse` with `zodOutputFormat`
  - `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`
  - model from `ANTHROPIC_MODEL`, default `claude-opus-5-5`
  - a test override
- **API facts that shape this design** (from the platform docs):
  - PDFs are accepted as `document` blocks: up to 600 pages (100 when the context window is under 1M) and 128 MB per request on the Claude API. Every page is read as text and as an image, so scanned pages work.
  - Amazon Bedrock accepts base64 PDF sources only.
  - **Citations and structured outputs can't be combined:** a request with both returns 400. Claude Opus 5.5 has a 1M context window.
- **Background work:** the email change already sends after the response with `after()` from `next/server`. Uploads elsewhere are stored as `Bytes` in PostgreSQL.

## Goals / Non-Goals

**Goals:**
- An estimator turns a 10–20 page RFP into a reviewed feature list and filled-in wizard steps in a few minutes.
- Every proposal shows where it came from. Quotes are checked against the file's own text whenever the file has one.
- Nothing changes the request without an explicit "Add to request". An existing value is never overwritten by default.
- One code path for the Claude API now and Amazon Bedrock later.

**Non-Goals:**
- Email, Excel, slide or image formats.
- Sub task breakdowns with hours (matching proposes those).
- Comparing an SOW against its estimate.
- Exporting client questions (F-13).
- A general job queue.

## Decisions

### 1. Documents are stored on the request
- **The model:** a new `RequestDocument`, deleted with its request (`onDelete: Cascade`):
  - `id`, `requestId`, `fileName`, `kind` (`CLIENT_REQUIREMENTS` | `FOLIO3_SOW`), `format` (`PDF` | `DOCX`), `bytes`, `sizeBytes`, `fingerprint` (SHA-256)
  - `pageCount`, `textLayer` (JSON: page texts for a PDF, `{heading, text}` sections for a DOCX)
  - `status` (`READING` | `READY` | `FAILED` | `NOT_SET_UP`), `error`, `readStartedAt`, `readAt`, `model`
  - `proposal` (JSON), `addedItemIds` (text[]), `addedAt`, `addedById`, `uploadedById`, `createdAt`
- **Why not reuse `UploadedFile`:** it serves import provenance and isn't deleted with a request, but the spec requires deleting documents with their request.
- **Type check:** by content. A PDF starts with `%PDF-`. A DOCX is a ZIP (opened with the existing `jszip`) containing `word/document.xml`. The 25 MB limit is checked before parsing.
- **Text layer:**
  - DOCX: `mammoth` converts to HTML and is split into sections at headings.
  - PDF: per-page text from `unpdf`, which also gives the page count. A page with almost no text counts as scanned.
  - Used only for quote checks and the DOCX prompt, never shown as "the document".

### 2. One Claude call per document, structured output, quotes checked locally
- **Why not native citations:** they would give verified quotes, but can't be combined with structured output. We need structured output, because the review needs typed proposals: features with parts, enumerated detail values, assumptions per part.
- **So:** the schema asks for `page` (PDF) or `section` (DOCX) and a `quote` (at most 200 characters, copied word for word) on every item.
- **Quote check:** `src/lib/documents/quotes.ts` normalises both sides (case, whitespace, curly quotes, dashes, hyphenation at line ends). It looks for the quote on the cited page, then the neighbouring pages (or the cited section, then the whole DOCX).
  - Found: **Quote checked**.
  - Page has no text layer, or the quote isn't found: **Check the page**, with a link that opens the PDF at that page (`#page=N`).
- **The request:**
  - `client.beta.messages.stream` with `output_config: { format: zodOutputFormat(ProposalSchema) }`, `max_tokens: 32000`, the same fallback beta and model setting as AI guesses
  - `finalMessage()`, then parse with zod; streaming avoids HTTP timeouts on long documents
  - a `refusal` or `max_tokens` stop, or a schema mismatch, fails the document with a readable reason
- **What Claude receives:**
  - a PDF as a base64 `document` block titled with the file name; a DOCX as its sections in text, each with a `[Section: heading]` marker
  - the active catalog technologies per part, the allowed values for every detail field, and the request's existing feature names, so it doesn't propose them twice
  - instructions to leave out anything the document doesn't say, to set `needsConfirmation` when unsure, and to put a technology that isn't in the catalog in the part's `note`
- **`ProposalSchema`** (pure, in `src/lib/documents/proposal.ts`): `features[]`, `details` (one optional entry per field, each with values, cite and confidence), `assumptions[]`, `risks[]`, `questions[]`. Every item has an `id` generated after parsing, so the review and `addedItemIds` can refer to it.
- **Alternative considered:** two passes (citations first, then structuring). Twice the cost and time, and the quote check above gives the estimator the same assurance.

### 3. Reading in the background
- **Start:** the upload action stores the document as `READING` (or `NOT_SET_UP` when no reader is configured), then calls `after(() => readDocumentSoftly(id))`. "Read again" does the same.
- **Running:** `readDocumentSoftly` claims the row (`READING` with `readStartedAt` set now), reads it, then writes `READY` with the proposal, or `FAILED` with a short reason. It never logs document text.
- **Stuck reads:** a `READING` row older than 10 minutes is shown as Failed ("Reading took too long") and can be read again. That covers a server restart mid-read.
- **Waiting:** the Requirements step and the review page refresh every 3 seconds while any document is reading (`router.refresh()`), and stop once none is.
- **Readers:**
  - `getDocumentReader()` returns the Claude reader when `ANTHROPIC_API_KEY` is set, `null` otherwise
  - `DOCUMENT_READER=stub` (tests only, refused in production like `EMBEDDINGS_PROVIDER=stub`) gives a deterministic reader that turns DOCX headings into features
  - integration tests use `setDocumentReaderForTests`, like AI guesses

### 4. The review
- **Building it:** `buildReview(proposal, request)` (pure) marks:
  - duplicate features (same normalised name)
  - detail fields that already have a value (unticked, both values shown)
  - items already added (from `addedItemIds`)
  - technologies resolved to catalog ids
- **Editing:** `/estimates/[id]/documents/[documentId]` renders it in a client component. The person can tick, edit, delete, merge (selected features → one, keeping all cites) and split (one → two, both keeping the cite). This is all client state until "Add to request".
- **Adding:** `applyDocument(actor, documentId, selection)` checks the selection with zod and loads the request with `loadForEdit`, which refuses it when the request can't be edited. Then, in one transaction:
  - appends features after the current last position
  - creates any missing `RequestPart`, with proposed catalog technologies added to its part
  - updates the step 1 fields; unions the list fields (application types, operating systems, browsers, hosting, environments, app stores, compliance); sets non-functional needs to enabled with the note
  - appends assumptions and risks to their parts, skipping exact duplicates
  - creates `ClientQuestion` rows with their source
  - records `addedItemIds`, `addedAt` and `addedById`, then calls `syncTasks`
- **Matching:** after the transaction, the action runs `computeSuggestions(requestId, newTaskIds)`. A matching failure is logged and the features stay added; the Estimate tab's "Find matches" still works.
- **Leaving the wizard step:** the request's `lastStep` isn't changed, so "Continue where you left off" still works.

### 5. Client questions
- **The model:** a new `ClientQuestion` with `id`, `requestId` (cascade), `text` (max 1000), `position`, `source` (JSON: document id and name, page or section, quote; null when typed), `createdById`, timestamps.
- **On the request page:** a "Questions for the client" card lists them. People who may edit the request can add, edit and remove questions.
- **Export:** nothing changes; the lean export still omits the Questions sheet.

### 6. Who may do what
- **Viewing and downloading:** the request's existing view rule. The download route streams the bytes with `Content-Disposition: attachment` and the stored file name.
- **Uploading, removing, reading again and adding:** `loadForEdit`, the same rule as editing the wizard.
- **Removing a document:** deletes the file and its proposal. Items already added stay in the request.

## Risks / Trade-offs

- **Quotes from scanned pages can't be checked automatically:** they show "Check the page" with a direct page link. The estimator confirms by reading it, as the brief asks.
- **Cost and time:** one Opus call per document. A 20-page RFP is roughly 30–60k input tokens and 5–10k output tokens, a few minutes at most. A failed read can simply be retried. A document beyond the model's page limit fails with the API's reason, and the person can split the file.
- **Large files in the database:** 25 MB per file is fine at Folio3's volume. On AWS they can move to S3 behind the same functions.
- **`after()` and restarts:** a restart mid-read leaves the document `READING`. The 10-minute rule turns it into Failed with "Read again". No job queue is needed at this volume.
- **Confidentiality:** client documents go to Anthropic's API now and to Bedrock in Folio3's AWS later. Both match the brief's "approved AI provider" rule. Document text is never logged, emailed or exported.
- **Prompt injection in a document:** Claude's output is only a proposal, validated by schema and shown for review. Nothing in a document can change the request, call tools or reach other data.
