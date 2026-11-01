# Design

## Context

- **What exists on `main`:**
  - the estimate file parser (`src/server/estimate-parser`): sheet kinds, Tasks and Sub tasks with rows, warnings, fingerprint, header details, Summary QA/PM %
  - the actuals matching (`src/lib/actuals/match.ts`) and versions (`ActualsVersion`/`ActualHours`)
  - requests with parts, features, `EstimateTask`/`SubTask` (hours in tenths), the outcome field, and `canEditRequest`
  - pending actuals uploads are stored in the database
- **No samples in the repo:** real past estimates must never be committed. Tests use synthetic workbooks (as the parser's tests do) and files exported by the tool itself.
- **Brief references:** F-08 (upload, extraction, preview, duplicates, storage, acceptance) and section 15 (sample findings).

## Goals / Non-Goals

**Goals:**
- Reuse the parser and the actuals matcher unchanged. The import is orchestration plus storage.
- Nothing becomes a historical project without a person's approval. Every Sub task keeps its source.
- A batch survives bad files and can be finished over several sessions (decisions are stored).

**Non-Goals:**
- A background queue (a batch is parsed within the upload request).
- SOW and RFP attachments, free-form table mapping, and search (F-04).

## Decisions

### 1. Data model

| Model / field | Notes |
|---|---|
| `UploadedFile` (`id`, `fileName`, `bytes`, `fingerprint` (indexed), `kind` enum `ESTIMATE`/`ACTUALS`, `uploadedById`, `createdAt`) | Every imported file. It's never looked up by name. Actuals versions keep their own bytes, as today. |
| `ImportBatch` (`id`, `createdById`, `createdAt`, `sourceName` (the zip or file name), `notes String[]` (ignored files)) | One per upload. |
| `ImportedProject` (`id`, `batchId` cascade, `folder`, `estimateFileId?`, `actualsFileId?`, `status` enum `READY`/`FAILED`/`APPROVED`/`REJECTED`/`SKIPPED`, `failure?`, `parsed Json` (the parser result without bytes), `actualsParsed Json?`, `decisions Json` (corrections and duplicate choice), `duplicate Json?` (kind and target), `requestId?` → `EstimationRequest` SetNull, `decidedById?`, `decidedAt?`) | One per project folder. `parsed` is stored once, so previews don't re-parse. |
| `EstimationRequest.origin` enum `NEW`/`IMPORTED` (default `NEW`), `baseline` enum `AI_ERA`/`PRE_AI` (default `AI_ERA`), `importedProjectId?` | Imported projects are `IMPORTED` + `PRE_AI`. |
| `SubTask.sourceFileId?` → `UploadedFile`, `sourceSheet?`, `sourceRow?` | Set only for imported Sub tasks. |

- **Why store `parsed` JSON instead of re-parsing on every preview:** parsing 100 files twice is wasteful, and decisions must apply to exactly what was previewed (the same reasoning as pending actuals uploads).

### 2. Upload and grouping (`src/server/import/upload.ts`)
- **Route:** `POST /settings/import/upload`, Admin only, with the same-origin check used for actuals uploads. It takes multipart form data with either a `zip`, or `estimate` plus an optional `actuals`.
- **Zip reading:** `jszip` (pinned 3.10.2, already in the tree through ExcelJS).
  - Files over 10 MB, and zip entries outside a folder depth of 1 (`Folder/file.xlsx`), are noted and skipped.
  - Entries are read lazily, and the total uncompressed size is capped at 300 MB, which guards against zip bombs.
- **Grouping:**
  - by top-level folder; files in the zip root are their own projects
  - in a folder, the file matching `/[-_ ]actuals\.xlsx$/i` is the actuals file, and the other `.xlsx` is the estimate
  - two estimates in one folder fail the project with "This folder has more than one estimate file"
  - non-`.xlsx` files go in the batch notes
- **Processing:** each project is parsed with the estimate parser. An unreadable estimate fails the project with the parser's message, and the batch continues. Files are stored as `UploadedFile`. Then duplicates are detected (Decision 4).
- Over 150 projects → the whole upload is refused before anything is stored.

### 3. Preview model (`src/lib/import/preview.ts`, pure)
`buildPreview(parsed, decisions)` returns the project details (with overrides), and per sheet: kind, assigned part (from the decision, or the kind when it's a part, else "unassigned"), and its Tasks and Sub tasks after renames and exclusions, with source rows. Approval and the page both use it, so what is approved is what was shown.

Decisions shape:
```ts
{ projectName?, clientName?, sheetParts?: Record<sheet, Part | "skip">,
  renames?: Record<"sheet!row", string>, excluded?: string[] /* "sheet!row" */,
  swapFiles?: boolean, duplicate?: "skip" | "keep" | "new-version" | "different" }
```

For delivered projects, the estimate-vs-actual comparison reuses `matchActuals`, with the preview's parts as the estimate.

### 4. Duplicates
- **Same fingerprint:** if an `UploadedFile` already exists whose `ImportedProject` was approved, mark it "Already imported" (`duplicate.kind = "same-file"`, with the existing request id). The choices are Skip or Keep both.
- **Same project:** if the normalized project name and client (lowercase, collapsed spaces, using the `nameKey` helper) equal an existing request with `origin = IMPORTED`, mark it "Possibly a newer version of …". The choices are Link as new version (it's approved as a new request with "replaces <id>" noted), Treat as a different project, or Skip. The detection runs again at approval time, in case another batch approved the same project meanwhile.
- **Same file name:** nothing, by design.
- Approval is refused until a duplicate choice is made when `duplicate` is set.

### 5. Approval (`src/server/import/approve.ts`)
One transaction per project:
1. Re-check Admin and status `READY`, and re-run duplicate detection.
2. Upsert the client by `nameKey`.
3. Create an `EstimationRequest`:
   - `origin IMPORTED`, `baseline PRE_AI`, status `APPROVED`
   - owner = the approving Admin; `projectManager` from the file or blank; the date from the file (else the upload date)
   - `qaPercent`/`pmPercent` from the Summary when present (else the defaults, with `qaEnabled`/`pmEnabled` false when the file had none)
   - the bug-fixing % from the first sheet that has one
   - outcome `DELIVERED` when there's an actuals file
4. For each assigned sheet → a `RequestPart` (duplicate parts are merged), then a `Feature` per Task, and an `EstimateTask` plus `SubTask`s with hours in tenths and `sourceFileId`/`sourceSheet`/`sourceRow`. A sheet's Tasks keep their order.
5. With actuals: run `matchActuals` against the new Sub tasks, using the parsed actuals file, and save an `ActualsVersion` (`FILE`, with the actuals bytes and fingerprint) and its rows. For historical files there's no confirmation step: proposed matches are accepted, and flagged "matched by similarity at import" so they can be audited.
6. Mark the project `APPROVED` with `requestId` and `decidedBy`/`decidedAt`.

Reject sets `REJECTED`, and Skip sets `SKIPPED`. Neither creates anything.

**Why accept similar matches automatically for historical files:** reviewing every match of 100 projects isn't realistic. The flag keeps them visible, and approval itself is the person's confirmation.

### 6. Pages
- `/settings/import`: the upload form (single or zip) and the list of batches with their summaries. It's a new Settings tab, "Import past projects", and the sidebar entry links here for Admins.
- `/settings/import/[batchId]`: the summary counts, and a table of projects (folder, project, client, status, duplicate badge, warnings count) with Open, Approve, Reject and Skip actions.
- `/settings/import/[batchId]/[projectId]`: the preview (details form, sheets with part selects, rows with rename and exclude, warnings, actuals comparison, duplicate choice) and Approve or Reject.
- Request page and Home: an "Imported" badge when `origin = IMPORTED`. On the request page, sources appear on the estimate page as "sheet, row N" under each Sub task title (read-only, since approved requests aren't editable).
- Downloads: `GET /settings/import/files/[fileId]` is for Admins. For historical requests, the request page links the original estimate file for everyone with a role (read-only knowledge).

### 7. Testing
- **Unit:** grouping rules (folders, root files, actuals suffixes, two estimates, ignored files); `buildPreview` (renames, exclusions, sheet parts, skip, swap); duplicate classification.
- **Integration:**
  - a zip with three projects (one delivered, one estimate-only, one unreadable), built from exports and synthetic workbooks
  - previews and approval → requests with sources, percentages and outcome Delivered with actuals version 1
  - the same file again → "Already imported"
  - changed content with the same project → "Possibly a newer version"
  - reject or skip create nothing; 403 for non-Admins; the 150-project limit
  - a 100-project batch parses in under 60 s
- **End-to-end:** an Admin uploads a zip, sees the batch summary, opens a project, assigns an unknown sheet and excludes a row, approves, and sees the imported request on Home with the "Imported" label and sources on its estimate.

## Risks / Trade-offs

- [Large zips in one request] → Caps (100 MB zip, 300 MB uncompressed, 150 projects), and synchronous parsing at about 100 ms per file. A queue can come later if real batches are slower.
- [Automatic similar matches for historical actuals] → They're flagged and visible in the accuracy report, and approval is explicit.
- [Database growth from stored files] → Real estimates are about 50–400 KB each, so 150 projects are well under 100 MB. Object storage comes with the AWS deployment.
- [Real files differ from synthetic tests] → Warnings rather than failures, plus the preview corrections. The product owner runs the import on samples A and B locally before the real bulk load (follow-up).

## Migration Plan

- **Rollout:** an additive migration: the enums and columns with defaults (existing requests become `NEW`/`AI_ERA`), and the new tables.
- **Rollback:** revert the code; the data stays.
