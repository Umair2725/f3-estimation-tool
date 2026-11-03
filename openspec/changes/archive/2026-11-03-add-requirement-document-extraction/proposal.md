# Proposal

## Why

Most estimation requests arrive as an RFP, a specification or a SOW. Today the estimator retypes every feature, platform and compliance need by hand. The Requirements step even says "Document upload is coming soon".

Reading the document and proposing the feature list saves the most time of any feature in the brief (F-09, Release 1). With F-05 out of scope, it is the last Release 1 feature left to build.

## What Changes

- **Upload in the Requirements step:**
  - one or more **PDF** or **Word (.docx)** files per request, up to 25 MB each
  - each file is marked as **Client requirements** or **Folio3 SOW**
  - files are checked by content, not just by name
  - anyone who can see the request can download the files
  - only people who may edit the request can upload or remove them
- **Extraction by Claude**, in the background, about 2 minutes for a typical 10–20 page RFP:
  - **PDFs** go to Claude as documents, so scanned pages are read too
  - **DOCX** files are converted to text first
  - each document gets a status (*Reading*, *Ready to review*, *Failed* with the reason) and can be read again
  - without an Anthropic key, upload still works and the page says AI reading isn't set up
- **What Claude proposes**, every item citing its document, page (or section for DOCX) and a short quote:
  - **features** with a description and the parts they need (Backend, Web/Frontend, Admin Panel, Mobile, Cloud/Infrastructure)
  - **request details** for steps 1–3: project name and client, application types, operating systems, browsers, parts and technologies from the catalog, hosting, environments, app stores, compliance and non-functional needs
  - **assumptions** and **risks**, each for a part
  - **questions for the client** where the document is unclear or contradictory
  - items Claude isn't sure of are flagged **Needs confirmation**; information the document doesn't give is left out, never guessed
- **Review before anything changes.** On a review page the estimator can:
  - accept, edit, delete, merge or split proposed features
  - accept or skip each request detail; a filled-in value is only replaced if they choose the document's value
  - accept, edit or skip assumptions, risks and questions
  - see quotes checked against the document's own text where the file has a text layer (*Quote checked* or *Check the page*)
  - then **Add to request** adds only what they kept; features already in the request are flagged and unticked
  - the added features get estimate Tasks at once and are matched straight away
- **Questions for the client** get a home: a list on the request page, editable by people who may edit the request. The template's Questions sheet stays out of the lean export until F-13.
- **Out of scope:** other formats (email, Excel feature lists, slides), Sub task breakdowns with hours (matching proposes those), comparing two documents against each other, and exporting client questions.

## Capabilities

### New Capabilities
- `requirement-documents`: uploading and storing request documents, Claude's extraction with citations and quote checks, the review page, and adding the kept items to the request.
- `client-questions`: questions for the client kept on a request, from a document or typed in, shown and edited on the request page.

### Modified Capabilities
- `estimation-requests`: the "Requirements step" requirement no longer shows upload as unavailable. It offers the document upload and links to the review.

## Impact

- **Database:**
  - new `RequestDocument` model holding the file itself (deleted with its request): Client requirements or Folio3 SOW, page count, text layer for quote checks, status, error, the extraction result, which items were added and when
  - new `ClientQuestion` model
- **Dependencies:**
  - `mammoth`, to turn DOCX into text
  - a small PDF text-layer reader (`unpdf`), used only to check quotes and count pages, never to replace Claude's reading
- **AI:** one Claude call per document through the existing Anthropic SDK setup (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`), streamed, with structured output. The PDF is sent as base64, which also works on Amazon Bedrock later.
- **Code:**
  - `src/server/documents/` (upload, extract, apply)
  - `src/lib/documents/` (pure schema, quote matching, merge and duplicate rules)
  - the Requirements step upload area
  - a new review page under `/estimates/[id]/documents/[documentId]`
  - questions on the request page
- **Tests:**
  - unit tests for quote matching, duplicate and merge rules, and mapping proposals onto steps 1–3
  - integration tests with a fake Claude client (upload limits and types, extraction states, apply, permissions)
  - e2e test of upload → review → add, with the fake client
