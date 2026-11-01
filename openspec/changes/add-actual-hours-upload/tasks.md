# Tasks

## 1. Data model and permissions

- [x] 1.1 Add the `ProjectOutcome` enum and outcome fields on `EstimationRequest`, plus `ActualsVersion`, `ActualHours` (with `ActualsSource` and `ActualStatus` enums) and `ActualsUpload` (pending uploads) as in design Decision 1; create the migration; verify `npm run db:deploy` on a fresh database, no drift, and existing requests getting outcome `NONE`
- [x] 1.2 Add `actuals.record` and `outcome.set` to `permissions.ts` and extend the role × permission matrix test

## 2. Outcome (`project-outcome` spec)

- [x] 2.1 Implement `src/server/outcome.ts` (`setOutcome` with the transition table, the "Estimate hours before recording an outcome" rule, owner or role check, Admin-only reopen of Delivered, the Lost reason); verify integration tests for each transition, 403 for an Estimator who isn't the owner, and the Delivered rules
- [x] 2.2 Show the outcome and its controls on the request page (Mark as won, Mark as lost with a reason, Mark as delivered, Reopen for Admins) and the outcome on the home list; verify e2e: the owner marks a request Won, and home shows "In delivery"

## 3. Matching (`actual-hours` spec)

- [x] 3.1 Implement `src/lib/actuals/similarity.ts` (normalize, bigram Dice with token containment, thresholds); verify unit tests: "User login" vs "User Login + OTP" ≥ 0.6, unrelated names < 0.6, and equal names 1
- [x] 3.2 Extend the estimate parser with the optional "Actual" column (an additive `actual` on Sub tasks); verify a parser test with an Actual column
- [x] 3.3 Implement `src/lib/actuals/match.ts` (sheets → parts with overrides and unknown sheets, Tasks then Sub tasks by exact and then similar names, Actual column, Min used with a flag when Min ≠ Max, Matched/Unplanned/Dropped, proposed matches needing confirmation, decisions applied); verify unit tests for each case in design Decision 10
- [x] 3.4 Implement `src/lib/actuals/report.ts` (totals by part and Task, variance against Min with "–" for Min 0, unplanned and dropped totals); verify unit tests, including the spec examples (-5% and +15%)

## 4. Recording and versions

- [x] 4.1 Implement `src/server/actuals.ts`: `getActuals` (the latest version, or the estimate with empty actuals, plus history); `saveManualVersion`; `createPendingUpload` (`.xlsx` only, ≤ 10 MB, parse, 24-hour expiry, expired ones cleaned up); `previewUpload`; `saveUploadVersion` (re-match with decisions, keep the file and fingerprint, delete the pending row); `discardUpload`; and `getVersionFile`. Check permissions (`actuals.record`, outcome In delivery, Delivered Admin-only) in each; verify integration tests for each, including the export → edit → upload → save round trip with one rename, one unplanned and one dropped row
- [x] 4.2 Add `POST /estimates/[id]/actuals/upload` (multipart, size and type checks, redirect to the preview) and `GET /estimates/[id]/actuals/versions/[versionId]/file` (download the original); verify integration or e2e tests for 401, 403, too large and wrong type

## 5. Pages

- [x] 5.1 Build `/estimates/[id]/actuals`: tabs per part, Sub task rows with Min–Max, Actual input and status, "Add unplanned row", Save (new version), the upload form, version history with file download, and the accuracy report (Final or In progress); read-only for people without `actuals.record` or when Delivered for non-Admins; verify e2e: a Tech Lead enters actuals and sees the report variance
- [x] 5.2 Build the preview page `/estimates/[id]/actuals/review/[uploadId]`: rows with status, estimate, actual, variance and flags; confirm or reject proposed matches; edit hours; assign unknown sheets; the parser's warnings; Save version and Cancel; verify e2e: upload an edited export, confirm the proposed rename, save, and see version 2 in the history
- [x] 5.3 Show "· actual N" next to the estimated total on Home and the request page once actuals exist; verify e2e

## 6. Docs and CI

- [x] 6.1 Update the seed (one sample request In delivery with a manual actuals version) and `README.md` (outcomes, recording actual hours, the upload and its rules, the accuracy report); verify the seed stays idempotent
- [ ] 6.2 Verify CI is green on the pull request

## Workflow follow-up

- When F-10 (review and approval) lands, restrict "Mark as won" to Approved or Exported requests.
- Next change from the brief: `add-historical-estimate-import` (F-08), reusing the parser and this matching.
