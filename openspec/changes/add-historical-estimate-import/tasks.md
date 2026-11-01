# Tasks

## 1. Data model

- [x] 1.1 Add `UploadedFile`, `ImportBatch`, `ImportedProject` (status, parsed and decision JSON, duplicate, created request) and the enums, `origin`/`baseline`/`importedProjectId` on `EstimationRequest`, and source fields on `SubTask` (design Decision 1); create the migration; verify `db:deploy` on a fresh database, no drift, and existing requests becoming `NEW`/`AI_ERA`
- [x] 1.2 Add `jszip` as a pinned direct dependency; verify `npm ci` and `npm ls jszip` show a single version

## 2. Pure logic

- [x] 2.1 Implement `src/lib/import/group.ts` (group zip entries into projects: folders, root files, `-actuals`/`_actuals`/` actuals` suffixes, two estimates → failure, non-.xlsx → notes); verify unit tests for each rule
- [x] 2.2 Implement `src/lib/import/preview.ts` (`buildPreview` with overrides, sheet parts, skip, renames, exclusions, swap) and duplicate classification helpers; verify unit tests

## 3. Server

- [x] 3.1 Implement the upload service (Admin only; single or zip; size, depth and count limits, including the uncompressed cap; parse each project; store `UploadedFile`s; failed projects don't stop the batch; duplicate detection); verify integration tests: a three-project zip with one unreadable file, the 150-project limit, 403 for a Tech Lead
- [x] 3.2 Implement decisions and approval (save decisions; approve in one transaction into a historical request with sources, percentages, bug fixing, outcome, and actuals version 1 via `matchActuals` with similar matches flagged; re-check duplicates; reject and skip); verify integration tests for a delivered and an estimate-only project, the duplicate choices, and that reject or skip create nothing
- [x] 3.3 Add `POST /settings/import/upload` (same-origin check, multipart) and file downloads (`/settings/import/files/[fileId]` for Admins, plus the original estimate of a historical request for everyone with a role); verify 401, 403 and the redirects
- [x] 3.4 Performance check: a synthetic 100-project batch uploads and parses in under 60 s locally; record the time in the PR

## 4. Pages

- [x] 4.1 Build `/settings/import` (upload form, batch list) as a new Settings tab, and make the sidebar "Import past projects" a link for Admins; verify e2e as Admin and that an Estimator sees no entry
- [x] 4.2 Build the batch page (summary counts, project table, Approve, Reject and Skip actions) and the project preview (details form, sheet parts, row rename and exclude, warnings, actuals comparison, duplicate choice); verify e2e: upload a zip, assign an unknown sheet, exclude a row, approve, and see the summary update
- [x] 4.3 Show the "Imported" label on Home and the request page, Sub task sources on the estimate page, and the original-file link on historical requests; verify e2e

## 5. Docs and CI

- [x] 5.1 Update `README.md` (preparing a zip, the actuals naming, the preview, duplicates, what approval creates, limits; never commit real files)
- [ ] 5.2 Verify CI is green on the pull request

## Workflow follow-up

- Product owner: import samples A and B locally (they stay outside git) and report any misreadings as new parser test cases before the real bulk load.
- Next changes from the brief: `add-review-and-approval-workflow` (F-10), then `add-ai-feature-matching-with-citations` (F-04), which searches approved and historical projects.
