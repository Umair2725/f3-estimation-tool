# Tasks

## 1. Data model and defaults

- [x] 1.1 Add `EstimateTask`, `SubTask` (hours in tenths), `EstimateDefaults`, `ExportRecord` (`ExportKind` enum), the `RequestPart` extras (deployment tenths, assumptions, risks) and the `EstimationRequest` overhead and rate fields with defaults; create the migration, including the default `EstimateDefaults` row; verify `npm run db:deploy` on a fresh database, no drift from `db:migrate`, and existing requests getting QA 25 / PM 30 / bug 10 / $30 unconfirmed
- [x] 1.2 Implement `src/server/estimate-defaults.ts` (`getDefaults`, `updateDefaults` with `settings.manage` and the validation rules) and copy the defaults into new requests in `createRequest`; verify integration tests: starting defaults, an Admin change affecting only new requests, "The default rate must be one of the approved rates", 403 for an Estimator
- [x] 1.3 Build Settings → Estimate defaults (percentages, approved-rate list editor, default rate) as a new Settings tab; verify e2e as Admin: change QA to 20% and see a new request start at 20%

## 2. Tasks follow scope

- [x] 2.1 Change the wizard's step 4 save to keep feature ids (update, create, delete by id), and add `syncTasks(tx, requestId)` after the step 2 and step 4 saves; verify integration tests: Sub tasks survive renaming and reordering features; removing a feature's part or the part itself removes those Tasks; adding a part to a feature adds an empty Task; the existing wizard tests still pass

## 3. Hours, totals and checklist

- [x] 3.1 Implement `src/lib/estimation/totals.ts` (`computeTotals`) and the hours schema (0–9999, one decimal, "Enter hours from 0 to 9999, with at most one decimal"); verify unit tests, including the spec example (195.3–275.9 h, $5,859–$8,277), QA or PM off, a part with Deployment only, and an empty estimate
- [x] 3.2 Implement `getEstimate(actor, id)` and `saveEstimate(actor, id, input)` in a server service (Sub tasks replaced per Task, part extras, overheads, rate in the approved list unless it is the request's current rate), checked with `canEditRequest`; verify integration tests for saving, reordering, view-only 403, "Choose one of the approved rates", and keeping a no-longer-approved current rate
- [x] 3.3 Implement `src/lib/estimation/checklist.ts` (Min > Max, 0-hour Sub tasks, Tasks with no Sub tasks, features with no hours, rate not confirmed, rate no longer approved, another client named); verify unit tests for each warning, including the whole-word, case-insensitive client match and the 4-character minimum
- [x] 3.4 Show each request's grand total on the home list ("195–276", "–" without hours) and on the request page, with a link to the estimate page; verify integration tests for the list totals and e2e that the home row updates after saving hours

## 4. Estimate page (`estimate-hours` spec)

- [x] 4.1 Build `/estimates/[id]/estimate`: part tabs, Task cards with Sub task rows (title, Min, Max, comment, move, remove, add), part extras (Deployment labelled with the environments, Assumptions, Risks), the overheads and rate panel, live totals, the checklist, Save with an unsaved-changes indicator and warning, and view-only mode; verify e2e as an Estimator: enter hours on two parts, see the spec's totals, save, reload and see them kept; as a Tech Lead: everything is disabled
- [x] 4.2 Add "Estimate hours" to the request page and Finish's destination, and show the latest export ("Last exported by … · time"); verify e2e from Finish to the estimate page

## 5. Excel export (`excel-export` spec)

- [x] 5.1 Add `exceljs` (exact version, install scripts approved if any), the template path (with `outputFileTracingIncludes`) and the Dockerfile copy; verify `npm ci` from clean, a test that loads the template and finds the expected sheets and prototype labels, and that the container build contains the template
- [x] 5.2 Implement the workbook builder (development sheets from prototype rows, named and limited to 31 characters, rows as needed, all totals as formulas with results from `computeTotals`, Bug Fixing %, Deployment with environments, Assumptions and Risks, Notes kept); verify integration tests reading the file back: formulas per row, stored results equal to `computeTotals`, a 9-Sub-task Task covered by its total, styles of the header and total rows kept
- [x] 5.3 Rewrite the Summary (project details, one row per development sheet, QA and PM % rows when enabled, Total, price block with rate cell and cost formulas, Resources and Weeks cleared, Special Considerations 27–34 from the request with no placeholders), remove the template's original sheets and stale defined names, and run the post-build check; verify integration tests: Summary formulas and results, no Questions sheet or sample questions, no placeholder text, no reference to a missing sheet, and a 300-Sub-task export in under 5 s
- [x] 5.4 Add `GET /estimates/[id]/export` (role check, file name "<project> – Estimate (internal) – <date>.xlsx" with an RFC 5987 `filename*`, no-store, `ExportRecord`); verify integration tests for 401, 403 (no role) and 200 with headers, and e2e: download as an Estimator, parse the downloaded file, and see "Last exported by Dev Estimator" on the request page

## 6. Docs, seed and CI

- [x] 6.1 Give the seed's sample requests Sub tasks, Deployment and assumptions, so a fresh demo has totals and a useful export; update `README.md` (estimate hours, overheads and defaults, the checklist, what the export contains and leaves out, how to open the report); verify the seed stays idempotent and a reader can export from a fresh clone
- [ ] 6.2 Verify CI is green on the pull request

## 7. Integration check

- [ ] 7.1 Export the seeded "Patient portal MVP" and open it in Microsoft Excel (and LibreOffice if available): no repair prompt, totals recalculate to the same values, changing the rate updates the cost, no QA, GD, PM or Questions sheets, no placeholders; record the result (and any style differences from the template) in the pull request

## Workflow follow-up

- Open a pull request from `feature/add-lean-excel-export`, merge it after review and a green CI run, then archive with `/opsx:archive add-lean-excel-export`.
- The client-facing export (price on or off, Approved only) is added with `add-review-and-approval-workflow` (F-10).
- Next change from the brief: `add-template-parser`.
