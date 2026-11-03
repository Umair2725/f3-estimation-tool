# Tasks

## 1. Data model and dependencies

- [x] 1.1 Add the `RequestDocument` model (with its `DocumentKind`, `DocumentFormat` and `DocumentStatus` enums, cascade-deleted with its request) and the `ClientQuestion` model. Generate the migration with `migrate diff`, then deploy it. Verify `db:deploy` on a fresh database, that there's no drift, `prisma generate`, and that deleting a request deletes its documents and questions (integration test).
- [x] 1.2 Install `mammoth` and `unpdf`, each pinned to the latest release at least two weeks old. Add `DOCUMENT_READER` (`claude` | `stub`, `stub` refused in production) to `env-schema.ts` and `.env.example`. Verify the unit tests for the new setting and that the build passes.

## 2. Pure logic

- [x] 2.1 `src/lib/documents/proposal.ts`: `ProposalSchema` (features, details per field with allowed values, assumptions, risks, questions, each with page or section, quote and `needsConfirmation`), and adding item ids after parsing. Verify unit tests: a valid sample parses, unknown detail values and over-long quotes are rejected.
- [x] 2.2 `src/lib/documents/quotes.ts`: normalising text and checking a quote on the cited page, the neighbouring pages, or a DOCX section. Verify unit tests: curly quotes, line-end hyphenation, a quote one page off, a page with no text layer, a quote not found.
- [x] 2.3 `src/lib/documents/review.ts`: `buildReview` (duplicates by normalised name, filled-in fields unticked with both values, items already added, catalog technology resolution with a note for unknown ones) and the merge and split helpers. Verify unit tests for every spec scenario under "Review before adding" and "Duplicates and filled-in values".

## 3. Server

- [x] 3.1 `src/server/documents/files.ts`: upload (content type check, the 25 MB limit, fingerprint, page count and text layer from `unpdf` or `mammoth`), list, download and remove, each with its permission. Verify integration tests: a PDF and a DOCX fixture are stored with their page or section count; xlsx, a renamed text file and a file over 25 MB are refused with the spec messages; a view-only person can download but not upload or remove.
- [x] 3.2 `src/server/documents/read.ts`:
  - the Claude reader: streamed, structured output, PDF as a base64 document, DOCX as text with section markers, catalog and allowed values in the prompt, refusal and `max_tokens` handling
  - the stub reader, and `setDocumentReaderForTests`
  - `readDocumentSoftly` with the claim, quote checks, statuses, the 10-minute stuck rule and `NOT_SET_UP`, never logging document text

  Verify integration tests with a fake reader: ready with counts, failed with a reason, read again, not set up, stuck after 10 minutes, and quotes marked checked or "check the page".
- [x] 3.3 `src/server/documents/apply.ts`: `applyDocument` in one transaction (features appended with parts, missing parts created with technologies, step 1–3 fields set or unioned, assumptions and risks per part, client questions with source, `addedItemIds`, `syncTasks`), then matching for the new Tasks. Verify integration tests: the spec's "Add the reviewed list" result, a request In review refused with nothing changed, adding again skips added items, and new Tasks have suggestions.
- [x] 3.4 `src/server/client-questions.ts`: list, add, edit, remove, with the request's view and edit rules. Verify integration tests, including that the export still has no Questions sheet.

## 4. Pages

- [x] 4.1 Requirements step: replace the "coming soon" box with the upload area (file picker with the kind, for people who may edit), the document list (status, counts, pages, uploader, Download, Remove, Read again, Review), and a refresh every 3 seconds while a document is reading. Upload and Read again call `after(readDocumentSoftly)`. Update the existing wizard e2e test that expects "coming soon".
- [x] 4.2 The review page `/estimates/[id]/documents/[documentId]`: sections for request details, features, assumptions and risks, and questions; cites with "Quote checked" or "Check the page" (a link opening the PDF at that page); "Needs confirmation" and "Already in the request" flags; tick, edit, delete, merge and split; "Add to request" with the result message. Add an `instant = false` layout if the route needs one.
- [x] 4.3 Request page: a "Questions for the client" card with add, edit and remove for people who may edit the request.
- [x] 4.4 E2E with `DOCUMENT_READER=stub`: upload a DOCX fixture as Client requirements, wait for "Ready to review", merge two features, untick one, add to the request, then see the features in the Requirements step, a question on the request page and suggestions on the Estimate tab. Also check a Tech Lead sees Download but no upload. Set `DOCUMENT_READER=stub` in the Playwright web server env and in CI.
- [x] 4.5 README: a "Requirement documents" section covering formats, limits, what's proposed, quote checks and the review flow, plus `DOCUMENT_READER`. Verify the README matches `.env.example`.

## 5. Verification

- [x] 5.1 Run lint, typecheck, Prettier, unit, integration, e2e and the build, all green.
- [x] 5.2 On UAT with the real Anthropic key: upload a fictional 10–20 page RFP PDF (and a scanned page) and a Folio3-style SOW DOCX. Check that reading finishes in under 2 minutes, that cites point to the right pages, and that quotes are checked on text pages and show "Check the page" on the scan. Record the results in the PR.
  - The first real read showed the API rejects the full schema as "too large"; Claude now answers in a flat `WireSchema` that `fromWire` converts (design §2).
  - 2026-11-03, `claude-opus-5-5`: the 12-page RFP read in 34 s (9 features, 13 details, 2 assumptions, 3 risks, 8 questions; 32 of 34 quotes checked, the 2 on scanned page 9 show "Check the page"). The 3-section SOW read in 13 s (4 features, 13 of 13 quotes checked).
- [x] 5.3 Open a PR. Verify CI is green on the PR.
  - PR #22 (the feature) and PR #24 (the reader fix) merged; the product owner confirmed CI was green.

## Workflow follow-up

- Merge with the product owner's OK, then archive `add-requirement-document-extraction` (sync `requirement-documents` and `client-questions` new, `estimation-requests` modified) on a `chore/archive-…` branch.
