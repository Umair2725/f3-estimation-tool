# Design

## Context

- **Current behavior:**
  - `add-estimation-request-wizard` (merged, not yet archived) stores requests, parts (`RequestPart`) with technologies, and an ordered `Feature` list
  - permission rules live in `src/server/estimation-requests.ts` (`canEditRequest`)
  - Home shows "–" for hours
- **The wizard's step 4 save replaces every feature row.** That would drop anything linked to a feature, so this change must make it keep ids (Decision 2).
- **The template** (`docs/templates/Empty_Estimation_Sheet.xlsx`, "Folio3 Project Estimation Template v 0.5"), as inspected on 2026-10-31:
  - **Summary:**
    - B2 is the project name; C5–C7 hold client, project manager and date
    - row 10 is the header (Minimum, Maximum, Comments, plus G "Max", H "Resources", I "Weeks")
    - row 11 is a single "Development Estimates" row linked only to 'Dev Mobile Estimates'; rows 12–14 are QA, GD and PM
    - row 16 is the Total: Min is `SUM(C11:C14)`, but Max is a **hard-coded 0**
    - G–I hold Resources and Weeks formulas
    - rows 25–34 are Special Considerations, with placeholder text such as `<Yes/No>`
  - **Development sheets** ("Dev Backend/Admin/Mobile Estimates", identical layout):
    - rows 2–6: title, date, by, and the Grand Total (`D6 = SUM(D31, D49, D56)`, **E6 = 0**)
    - row 8 is the header; rows 9–29 are three fixed Task blocks of 4–6 Sub tasks
    - Task Min totals are formulas, but **Max totals are 0**
    - row 31 is the development total (`SUMIF` on numbered rows, Max 0)
    - rows 34–49 are "Other Development Activities": Bug Fixing `D31*0.25`, Memory leaks, Deployment (Staging, Production, App Store), Code Review, Documentation, and the post-development total
    - rows 52–56 are Research Tasks; 59–64 Assumptions; 67–72 Risks; 75+ reference Notes
  - **Questions:** sample questions and answers from another project. It must never ship (spec "Lean output").
- **The export runs on the server.** Next.js 16 route handlers, Node runtime, and the standalone Docker image built in the foundation change.

## Goals / Non-Goals

**Goals:**
- An export that opens cleanly in Excel, where every total is a formula, and whose stored results match the tool to the decimal.
- Hours stored exactly, with no floating-point drift in totals.
- A data shape the AI changes (F-04, F-05, F-24) can attach suggestions and references to, without reshaping it.

**Non-Goals:**
- Generating the client-facing export. Its switch (price shown or hidden) and the approval rule come with F-10.
- Editing hours in Excel and re-importing them. That's the actuals upload (F-12) and the template parser.
- Pixel-identical copies of rows the export leaves out.

## Decisions

### 1. Data model

| Model / field | Notes |
|---|---|
| `EstimateTask` (`id`, `featureId` → `Feature` cascade, `requestPartId` → `RequestPart` cascade, unique (`featureId`, `requestPartId`)) | One per feature × part. The name and order come from the feature, so they are never stored twice. |
| `SubTask` (`id`, `taskId` cascade, `title`, `minTenths` Int, `maxTenths` Int, `comment`, `position`) | Hours stored as **tenths of an hour**. 12.5 h is 125, so sums are exact integers. |
| `RequestPart` gains `deploymentMinTenths`, `deploymentMaxTenths` (default 0), `assumptions String[]`, `risks String[]` | Per development sheet. |
| `EstimationRequest` gains `qaPercent` Int, `qaEnabled` Bool, `pmPercent` Int, `pmEnabled` Bool, `bugFixPercent` Int, `hourlyRate` Int (USD), `rateConfirmed` Bool | Filled from the defaults when the request is created. The migration gives existing rows the brief's defaults (25, true, 30, true, 10, 30, false). |
| `EstimateDefaults` (`id` = "default", `qaPercent`, `pmPercent`, `bugFixPercent`, `defaultRate`, `approvedRates Int[]`, `updatedAt`, `updatedById?`) | One row, inserted by the migration with the brief's values. |
| `ExportRecord` (`id`, `requestId` cascade, `userId` → User Restrict, `kind` enum `INTERNAL` (later `CLIENT`), `fileName`, `createdAt`) | The export audit trail. |

- **Alternative considered:** Decimal columns. Prisma returns `Decimal` objects, which need conversion everywhere. Integer tenths are simpler and exact; the API and UI use hours as numbers with one decimal.

### 2. Keep feature ids stable, and keep Tasks in sync
- The wizard's step 4 save changes from "delete all, recreate" to a diff:
  - update features whose id is sent (the client already keys rows by feature id)
  - create new ones, and delete the ones removed
  - so Tasks and Sub tasks of unchanged features survive
- After step 2 and step 4 saves, `syncTasks(tx, requestId)` runs:
  - it deletes Tasks whose feature no longer has that part
  - it creates the missing ones (each with no Sub tasks)
  - removed parts cascade-delete their Tasks
- The estimate page also calls `syncTasks` on load, so requests created before this change get their Tasks.
- **Why:** the Task list is derived from scope. Keeping it in sync in one function keeps the estimate and the wizard consistent.

### 3. Totals are one pure function, shared by the UI, the export and the home list
- `src/lib/estimation/totals.ts`: `computeTotals({ parts: [{ part, tasks: [{ subTasks: [{min, max}] }], deployment }], qa, pm, bugFixPercent, rate })`
  - works in tenths for sums
  - applies percentages as exact numbers, in the same order the Excel formulas do: per part dev, then bug = dev × %, then part total = dev + bug + deployment, then development = Σ parts, then QA and PM = development × %, then grand = development + QA + PM, then cost = grand × rate
  - returns numbers in hours, not rounded; the UI rounds to one decimal for display
- The export writes these values as the stored **results** of its formulas (ExcelJS `{ formula, result }`), so files show correct numbers even before Excel recalculates. Excel recomputes the same values.
- The home list needs the grand total per row. `listRequests` computes it from a lean query of the request's parts, sub task sums (grouped in SQL) and percentages. It's cheap enough at 25 rows per page.

### 4. Estimate page and saving
- `/estimates/[id]/estimate`: tabs per part (keyboard-accessible tablist).
  - Each Task is a card with a table of Sub tasks: title, Min, Max, comment, with move up, move down and remove, plus "Add sub task".
  - Below the Tasks: Deployment Min/Max (labelled with the request's environments), Assumptions and Risks (one per line).
- **Side panel:**
  - Overheads: QA % (on/off), PM % (on/off), bug fixing %, rate select from the approved list (plus the current rate if it's no longer approved), and "Rate confirmed"
  - live totals from `computeTotals`, then the checklist and **Export (internal)**
- **Saving:**
  - one "Save" action sends the whole estimate: Sub tasks per Task id, part extras, overheads
  - the server validates it (zod), checks `canEditRequest`, and replaces Sub tasks per Task in one transaction
  - an unsaved-changes indicator and a `beforeunload` warning, as in the wizard
  - Export is disabled while there are unsaved changes, so the file always matches what's stored
- **Why one save instead of per-cell autosave:** it's predictable, has one round trip, and matches the wizard's "save before moving on" model. Autosave can come later.
- **View-only people** get the same page with inputs disabled, and the server refuses saves (403).

### 5. Workbook builder (`src/server/export/workbook.ts`)
- **Library:** `exceljs` 4.4.0 (pinned). It reads and writes styles, merges, column widths and formulas with cached results, and needs no native dependencies.
  - Alternative: `xlsx` (SheetJS). Its community edition drops most styling on write, which breaks "keeping the template's styles".
- **Approach: build from row prototypes, not by editing in place.** Inserting rows into the template's fixed blocks would break its formulas and merges. Instead:
  1. Load the template once per export (it is about 150 KB).
  2. Read **prototype rows** from 'Dev Mobile Estimates':
     - header rows 1–8, Task row 9, Sub task row 10, development total row 31
     - section header row 34, Bug Fixing row 35, Deployment rows 39–42, post-development total row 49
     - Assumptions and Risks headers and items (59–60, 67–68), and Notes rows 75–end
     - for each, its values, styles, heights and merges
  3. For each part, add a new sheet named `<Part> (<tech, tech>)`:
     - limited to 31 characters, with `[]:*?/\` removed, and de-duplicated
     - column widths and sheet view copied from the prototype
     - rows written in order from the prototypes
  4. Write formulas by the row numbers actually used:
     - Task Min/Max = `SUM` of its Sub task rows (a Task without Sub tasks gets 0, which the checklist flags)
     - development total = `SUM` of the Task rows (an explicit list or ranges; no `SUMIF` on numbering)
     - Bug Fixing = development × `<p>%` (written as `D{dev}*0.1`, with the % in Comments)
     - post-development = Bug + Deployment
     - Grand Total (row 6) = development + post-development, for both Min and Max
  5. **Summary** is rewritten in the same way from its own prototypes, rows 1–16:
     - one row per development sheet (`='<sheet>'!D6` and `!E6`)
     - QA and PM rows only when enabled (`=<dev range sum>*0.25`)
     - Total
     - the price block: "Hourly rate (USD)", then Cost (Min) = `C<total>*<rate cell>` and Cost (Max)
     - G–I (Max, Resources, Weeks) cleared, values and formulas
     - rows 25–34 (Special Considerations) keep their labels; their C and E cells are filled from the request, or left empty, with no placeholder text
  6. Remove the template's original sheets (all three development sheets, QA, GD, PM, Questions), plus any defined names or print areas that refer to them.
  7. A **post-build check** walks every formula and fails if it refers to a sheet that doesn't exist or still contains a placeholder (`<`, `Task -`, `Sub task -`). It throws, rather than return a broken file.
- **Template location:**
  - `TEMPLATE_PATH` resolves `docs/templates/Empty_Estimation_Sheet.xlsx` from `process.cwd()`
  - `next.config.ts` `outputFileTracingIncludes` adds it to the standalone build, and the Dockerfile copies it
  - an integration test fails if the template is missing or its sheet names change

### 6. Export route
- `GET /estimates/[id]/export` (route handler, Node runtime):
  - `authorize()`: any role; 401 or 403 otherwise
  - load the request with its estimate
  - build the workbook and record an `ExportRecord`
  - respond with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="<ascii fallback>"; filename*=UTF-8''<encoded>` (the name contains an en dash)
  - `Cache-Control: no-store`
- **Why GET:** the browser download works with a plain link, and exporting only reads data plus an audit row. Same-site cookies (`SameSite=Lax`) and the role check keep it private.

### 7. Checklist is a pure function
- `src/lib/estimation/checklist.ts` returns `{ code, message, link }[]` from the estimate, the request text, the other clients' names, and the approved rates.
- **"Names another client":** a case-insensitive whole-word match of other clients' names (only names of at least 4 characters, to avoid noise) against:
  - feature names and descriptions
  - Sub task titles and comments
  - assumptions and risks
  - other considerations
- It is unit-tested, and reused later by F-10's pre-submit checklist.

### 8. Settings → Estimate defaults
- `src/server/estimate-defaults.ts`: `getDefaults()` (any role) and `updateDefaults(actor, input)` (`settings.manage`, zod-validated: percentages 0–100, rates unique whole numbers 1–1000 with at least one, and the default rate in the list).
- A new tab in the Settings tab bar.
- `createRequest` copies the defaults into the new request in the same transaction.

### 9. Testing
- **Unit:**
  - `computeTotals`, including the spec example 195.3–275.9 and $5,859–$8,277, plus PM off and no parts
  - the checklist codes, sheet-name sanitizing and the file-name format
  - the hours schema (0–9999, one decimal)
- **Integration (database + builder):**
  - the step 4 diff keeps Sub tasks; `syncTasks` across the step 2 and 4 changes
  - the save permission rules (owner, Admin, view-only 403)
  - defaults applied to new requests only; the defaults Admin-only and validation rules
  - export: build a workbook for a seeded request, read it back with ExcelJS, and assert:
    - sheet names, Summary rows and formulas, stored results equal to `computeTotals`
    - Resources and Weeks empty
    - no Questions sheet, no placeholder text, no reference to a missing sheet
    - a 9-Sub-task Task covered by its total
- **End-to-end:**
  - enter hours as an Estimator and see the totals
  - the checklist warnings
  - download the export (Playwright download), then parse it in the test
  - a Tech Lead sees view-only
  - an Admin changes a default, and a new request starts from it

## Risks / Trade-offs

- [ExcelJS may not keep every template feature, such as conditional formatting or theme fonts] → The integration test compares key styles (fonts, fills, borders on header and total rows) against the template. Anything lost is listed in the PR. Manual check: open the file in Excel and LibreOffice (task 8.1).
- [The template file changes and breaks the prototype row numbers] → The prototype rows are looked up by their label text ("Task", "Bug Fixing", "Deployment", "Assumptions", "Risks", "Notes"), not by fixed numbers. A test fails loudly if a label is missing.
- [Floating-point differences between `computeTotals` and Excel] → Same operation order, with the results stored from `computeTotals`. A difference would only show after Excel recalculates, and only beyond 1e-9. Tests compare to 1e-9.
- [Many Sub tasks make the estimate page heavy] → Fine at the brief's scale (around 100 Sub tasks); the brief's target is a 100-Sub-task export in under 30 s. A test exports 300 Sub tasks and asserts it takes under 5 s.
- [GET export can be triggered by a link] → It only reads data and adds an audit row; the session cookie is `SameSite=Lax`, and access is checked. Accepted.

## Migration Plan

- **Rollout:** one additive Prisma migration:
  - new tables, new columns with defaults, and the `EstimateDefaults` row
  - existing requests get the default percentages and rate, unconfirmed
  - Tasks are created on demand by `syncTasks`
- **Rollback:** revert the code; the new tables and columns can stay unused.
