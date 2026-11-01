# Design

## Context

- **What exists on `main`:**
  - requests with parts, features, `EstimateTask` (feature × part) and `SubTask` (hours in tenths), and the estimate page
  - the internal Excel export (sheets named like "Backend (Node.js)")
  - the estimate file parser (`src/server/estimate-parser`): sheet kinds, Tasks and Sub tasks with rows, warnings, fingerprint, and the `npm run parse-estimate` command
- **Approval doesn't exist yet:** review and approval (F-10) comes later. The brief puts actuals before it, so outcomes aren't tied to an Approved status yet (proposal, "Out of scope").
- **Patterns to follow:** server services with typed `ServiceError`s and permission checks; server actions returning `{ ok, message, fields }`; pages under `(app)` using `requireRole()`.

## Goals / Non-Goals

**Goals:**
- One matching function used by both the upload and, later, the bulk import (F-08).
- Actual hours stored per version, never overwritten, so history and the accuracy numbers can be trusted.
- No AI. Name similarity is a small deterministic algorithm.

**Non-Goals:**
- The calibration report, benchmarks, single-feature actuals, and match references.
- Object storage for files. Files go in the database (≤ 10 MB) until F-08 decides on storage.

## Decisions

### 1. Data model

| Model / field | Notes |
|---|---|
| `EstimationRequest.outcome` (enum `ProjectOutcome`: `NONE`, `IN_DELIVERY`, `LOST`, `DELIVERED`, default `NONE`), `outcomeReason?`, `outcomeChangedAt?`, `outcomeChangedById?` | Separate from `status`, which follows the review workflow. |
| `ActualsVersion` (`id`, `requestId` cascade, `number` (1, 2, …, unique per request), `source` enum `MANUAL`/`FILE`, `fileName?`, `fileBytes Bytes?`, `fingerprint?`, `createdById`, `createdAt`) | The latest version (highest number) counts. |
| `ActualHours` (`id`, `versionId` cascade, `subTaskId?` → `SubTask` SetNull, `requestPartId` → `RequestPart`, `taskTitle`, `title`, `estMinTenths`, `estMaxTenths`, `actualTenths?`, `status` enum `MATCHED`/`UNPLANNED`/`DROPPED`, `similarity?` (0–1), `flags String[]`, `sourceSheet?`, `sourceRow?`) | One row per estimated Sub task (Matched or Dropped) plus Unplanned rows. **Estimates are copied in**, so a version stays accurate even if the estimate is edited later. |
| `ActualsUpload` (`id`, `requestId` cascade, `fileName`, `fileBytes`, `fingerprint`, `parsed Json`, `createdById`, `expiresAt`) | A pending upload, waiting for the preview to be confirmed (Decision 6). |

- **Why copy the estimate into each version:** the accuracy report must not change silently when someone edits the estimate afterwards. `subTaskId` keeps the link for F-04/F-24, and `SetNull` means deleting a Sub task never deletes history.
- **Alternative considered:** storing a JSON blob per version. Relational rows let F-04 and F-24 query actuals per Sub task.

### 2. Permissions
- New in `permissions.ts`: `actuals.record` → Tech Lead, Architect, Admin; `outcome.set` → Tech Lead, Architect, Admin.
- The owner may also set the outcome. That's checked in the service, like `canEditRequest`.
- Delivered: only Admins (`settings.manage`) may save actuals or reopen.
- Every check lives in `src/server/actuals.ts` and `src/server/outcome.ts`.

### 3. Outcome service (`src/server/outcome.ts`)
- `setOutcome(actor, id, { outcome, reason? })`
- It checks the transition table from the spec, requires at least one Sub task with hours, and checks the role or ownership rule.
- It records `outcomeChangedAt` and `outcomeChangedById`.

### 4. Name similarity (`src/lib/actuals/similarity.ts`, pure)
- **Normalize:** lowercase, `&` → "and", punctuation becomes spaces, collapse spaces.
- **Similarity:** the Sørensen–Dice coefficient on character bigrams of the normalized names, combined with token containment. If every token of the shorter name is in the longer one, the score is at least 0.75, so "User login" vs "User Login + OTP" scores high.
- An equal normalized name scores 1. A proposal needs ≥ 0.6.
- **Why:** it's deterministic, has no dependency, and handles the brief's example. Thresholds are constants and unit-tested.

### 5. Matching (`src/lib/actuals/match.ts`, pure)
- **Input:** the estimate (parts → Tasks → Sub tasks with ids and Min/Max) and the parsed file (development sheets with kind and Tasks/Sub tasks), plus the sheet-to-part choices made on the preview.
- **Steps:**
  1. **Sheets → parts:** by the parser's kind. If two sheets share a kind, or a kind isn't on the request, the user assigns them. Unknown sheets are unassigned until the user picks a part or "skip".
  2. **Within a part, Tasks:**
     - exact normalized name → match
     - otherwise the best similarity ≥ 0.6, used greedily from the highest pair down, each Task used once → proposed
     - Task rows that don't match keep their Sub tasks, which are matched against all Sub tasks of that part (handles a renamed Task)
  3. **Sub tasks within matched Tasks:** the same exact-then-similar rule.
  4. **Hours per file row:**
     - `actual` = the "Actual" column if the parser saw one (Decision 7)
     - otherwise Min, flagged `min-max-differ` when Min ≠ Max
  5. **Results:**
     - estimated Sub tasks never matched → **Dropped** (no actual)
     - file rows never matched → **Unplanned**, with their part and Task title
     - proposed matches carry their similarity and need confirmation
- **Output:** a list of rows plus summary counts. It's used both to render the preview and, with the person's decisions applied, to build the version.

### 6. Upload and preview flow
- **Upload** posts the file to a route handler (`POST /estimates/[id]/actuals/upload`). It enforces the `.xlsx` name, 10 MB, permission and outcome, then parses.
  - On success it stores a **pending upload** (`ActualsUpload`, expiring after 24 hours) and redirects to `/estimates/[id]/actuals/review/[uploadId]`.
  - **Why a pending row instead of client state:** the file and the parse result are large, the preview may be reloaded, and saving must use the exact parsed data. Expired pending rows are deleted on the next upload.
- **Preview page:** a server component runs `match()` with the stored parse.
  - A client component lets the person confirm or reject proposals, edit hours, and assign sheets.
  - "Save version" calls an action that re-runs `match()` with the decisions on the server, validates the hours, writes the `ActualsVersion` (`FILE`, with bytes and fingerprint) and its `ActualHours` rows, and deletes the pending row, all in one transaction.
- **Cancel** deletes the pending row.

### 7. Parser extension (small)
- The parser's header detection also records an optional "Actual" (or "Actual hours") column.
- Sub tasks gain an optional `actual` value.
- The parser spec doesn't change: an extra column was already allowed. This is additive and covered by a new test.

### 8. In-tool entry
- `/estimates/[id]/actuals` shows the latest version (or the estimate with empty actuals). It has parts as tabs, rows of Sub tasks with Min–Max, Actual input and status, plus "Add unplanned row" per Task.
- Save sends each row (a Sub task id, or an unplanned row with its part, Task title and title) with its actual hours. The server builds a `MANUAL` version.
- Rows left empty are Dropped. The page hint says "leave empty if not built".

### 9. Accuracy report and totals
- `src/lib/actuals/report.ts` (pure): from a version's rows, totals by part and Task (matched only), variance against Min, unplanned and dropped totals.
- It's shown on the actuals page under the editor, with Final or In progress.
- The home and request page totals append "· actual N" (the sum of matched + unplanned actuals) when a version exists.

### 10. Testing
- **Unit:** similarity (the brief's example, thresholds); `match()` for exact, proposed, rejected, renamed Task, unplanned, dropped, Min≠Max, the Actual column, unknown sheets; the report variance and totals.
- **Integration:**
  - outcome transitions and permissions, including the Delivered lock and Admin reopen
  - a manual version
  - upload → pending → save: the original file is kept, the fingerprint is recorded, and history increments
  - pending expiry
  - 403s
  - a round trip: export a request, edit hours in the file with ExcelJS (rename one Sub task, add one, remove one), upload, save, and assert matched, unplanned and dropped rows
- **End-to-end:**
  - mark Won
  - enter actuals in the tool and see the report
  - upload an edited export, confirm a proposed match, save, and see the version history
  - Delivered locks for a Tech Lead
  - home shows "· actual N"

## Risks / Trade-offs

- [Similarity matches the wrong row] → Every non-exact match needs confirmation on the preview, and the person can reject it. Thresholds are conservative.
- [Files in the database grow it] → There's a 10 MB cap per file and few versions per project. F-08 revisits storage (object storage on Folio3 AWS).
- [Outcome without approval lets unreviewed estimates be marked Won] → Accepted until F-10. That change will add "only Approved or Exported requests can be marked Won".
- [The estimate changes after actuals exist] → Versions copy the estimates, so reports stay stable. A new version compares against the current estimate.

## Migration Plan

- **Rollout:** an additive Prisma migration: the outcome enum and fields (default `NONE`), and the `ActualsVersion`, `ActualHours` and `ActualsUpload` tables.
- **Rollback:** revert the code; the tables can stay unused.
