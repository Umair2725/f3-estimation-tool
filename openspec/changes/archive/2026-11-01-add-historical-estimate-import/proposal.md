# Proposal

## Why

Matching (F-04) can only reuse past work if past work is in the tool. Folio3's approved past estimates, and the actual hours of delivered projects, sit in Excel files on people's drives. Release 1 starts with a **bulk load of past projects** (brief F-08 and section 11), so the knowledge base is full on day one and the accuracy reports have real data.

The estimate file parser and the actuals matching are now on `main`, so the import is mostly orchestration:
- upload
- preview
- duplicate checks
- approval
- storage with sources

## What Changes

- **Settings → Import past projects** (Admins): a new screen and an **import batch** per upload.
  - **One project at a time:** an estimate file, plus an optional actuals file.
  - **In bulk:** a `.zip` with **one folder per project**, each with the estimate and, for delivered projects, the actuals file. The tool tells them apart by the `-actuals` file-name suffix, and they can be swapped on the preview.
  - Limits: `.xlsx` files up to 10 MB each, a `.zip` up to 100 MB, and up to 150 projects per batch.
- **Every file is parsed** with the estimate file parser and **fingerprinted**. The file name is never used as an identifier. Each project in the batch gets a **preview**:
  - **Details:** project, client, PM and date from the Summary, plus who uploaded it and when.
  - **Parts:** each sheet with its detected part. The reviewer can change the part or skip the sheet.
  - **Rows:** the Tasks and Sub tasks with hours and source sheet and row. The reviewer can **rename** or **exclude** rows.
  - **Warnings** from the parser, for example totals that don't match, Min > Max, or another template version.
  - **For delivered projects:** the estimate-vs-actual comparison (Matched, Unplanned, Dropped), using the actual-hours matching.
- **Duplicates:**
  - **Same content** as a file already imported → "Already imported" (Skip or Keep both).
  - **Same project details but different content** → "Possibly a newer version of …" (Link as new version, Treat as a different project, or Skip).
  - **Same file name for a different project** → no warning.
- **Approve or reject each project.** Nothing becomes part of the knowledge base until a person approves it.
  - An approved project becomes a **historical estimation request**: origin "Imported", status Approved, its hours marked as the **pre-AI baseline**, and the original files stored and downloadable.
  - Every Sub task keeps a link to its **source file, sheet and row**, so later references can say "Project X, Dev Backend Estimates, row 19".
  - A project with an actuals file is saved as **Delivered**, with its actual hours as a version.
- **Batch summary:** imported, skipped, failed and still waiting, each with its reason. A file that can't be read is reported and doesn't stop the rest of the batch.
- **Home and the request page** show an "Imported" label on historical requests. They are read-only, like other approved requests.

**Out of scope:**
- attaching SOWs and requirements documents to imported projects (they come with document reading, F-09)
- matching and search over the knowledge base (F-04)
- manual mapping of free-form tables (they're flagged, and the reviewer can skip them)
- object storage for files (files stay in the database for now, as with actual-hours uploads)

## Capabilities

### New Capabilities
- `historical-import`: import batches (single project or zip), per-project preview and corrections, duplicate detection, approval into historical requests with sources and stored files, and the batch summary.

### Modified Capabilities
- None. The "Imported" label and read-only behaviour on Home and the request page are specified in `historical-import`, because `home-screen` and `estimation-requests` aren't archived yet.

## Impact

- **Code:**
  - a Settings page and a batch page (`/settings/import`, `/settings/import/[batchId]`) with per-project previews
  - an import service (zip reading, grouping files into projects, parsing, duplicate detection, approval)
  - route handlers for uploads and file downloads
- **Database:**
  - `ImportBatch` and `ImportedProject` (status, decisions, links to files and the created request)
  - `UploadedFile` (bytes, fingerprint, original name, kind, uploaded by and when)
  - `origin` on `EstimationRequest`, a `source…` link (file, sheet, row) on `SubTask`
  - Prisma migration
- **Navigation:** "Import past projects" in the sidebar becomes a working link for Admins (it's "Soon" today).
- **Dependencies:** `jszip` (pinned). It's already installed as part of ExcelJS, and is now a direct dependency.
- **Performance:** a 100-project batch must finish parsing in one request in under 60 s locally (about 100 ms per file). A background job queue isn't needed yet.
