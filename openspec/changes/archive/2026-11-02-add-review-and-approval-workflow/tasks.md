# Tasks

## 1. Data model

- [x] 1.1 Add `version`, `reviewerId` and `submittedAt` to `EstimationRequest`, plus the `StatusChange`, `ReviewComment`, `ApprovedVersion` and `Notification` models and the `NotificationKind` enum (design Decision 1). Create the `review_workflow` migration, then verify that `db:deploy` works on a fresh database, there's no drift, and existing requests get version 1.
- [x] 1.2 Add an idempotent `backfill-approved` script (`npm run backfill-approved`, also called from the seed). Approved requests without an `ApprovedVersion` get v1 and a "Approved (imported)" history entry. Verify that running it twice creates nothing the second time.

## 2. Pure logic

- [x] 2.1 Implement `src/lib/review/transitions.ts`: the action table and `canAct` with messages and 403/409 codes. Verify unit tests for every action × status × role, plus owner self-review, a non-assigned Approver and imported requests.
- [x] 2.2 Implement `src/lib/review/attention.ts` (checklist warnings → review items with counts and links) and `src/lib/review/snapshot.ts` (the `ApprovedSnapshot` type, builder and reader with `snapshotVersion`). Verify unit tests, including snapshot totals equal to `computeTotals`.

## 3. Server

- [x] 3.1 Implement `src/server/review.ts` with submit, withdraw, requestChanges, approve and reopen. Each uses conditional updates and writes `StatusChange`, notifications through `notify()` and, for approve, the snapshot, all in one transaction. Verify integration tests: the full round to v2 Draft, a concurrent approve and withdraw (one 409), the submit refusals (incomplete, Min > Max, ineligible or own Approver), and Admin edits refused while in review.
- [x] 3.2 Add comments (`addComment` with request, Task or Sub task targets, kept after the target is removed) and the reads: `getReview`, `listReviews`, `approverChoices`, `unreadNotifications`, `markRequestRead` and `reviewCount`. Verify integration tests for comment permissions and for notifications created and marked read.
- [x] 3.3 Add `knowledgeBaseSources` (the latest approved version per request). Make import approval write `ApprovedVersion` v1 and its history entry. Verify that drafts are excluded, v1 is returned after a reopen, and an imported project has v1.
- [x] 3.4 Add the draft watermark to the export: `ExportData.status`, the Summary top cell and the page header. First check that the chosen cell is empty in the template. Verify integration tests: the watermark is on a Draft export and absent on an Approved one, and the parser round trip has unchanged totals.

## 4. Pages

- [x] 4.1 Request page: the Review card with the status line and actions (a submit dialog with the Approver select, Withdraw, Open review, Edit as new version), the History list and mark-read on open. Show the read-only state while locked.
- [x] 4.2 Review page `estimates/[id]/review`: summary, needs attention, the Task and Sub task table with comment threads, an overall comment box, and Approve and Request changes (the comment is required) for the assigned Approver only.
- [x] 4.3 Comment threads under Tasks and Sub tasks in the estimate editor (read and add where allowed).
- [x] 4.4 The `/reviews` page (Approver roles only; waiting, then recently reviewed). In the sidebar, Reviews becomes a link with a count. Add the Home "Awaiting my review" and "Updates" cards. Update `nav.test.ts`.
- [x] 4.5 Seed: "Field service app" becomes Approved v1 with history; "Patient portal MVP" stays a Draft. Update the README with a short "Review and approval" section.

## 5. Checks

- [x] 5.1 E2E `e2e/review.spec.ts`: Estimator submits to Tech Lead → the Tech Lead sees Reviews 1, comments on a Sub task and requests changes → the Estimator sees the update on Home, edits and resubmits → the Tech Lead approves → Approved, with history → Edit as new version gives v2 Draft. Also check that the Estimator has no Reviews entry and that /reviews shows "You don't have access to this page" (the same pattern as Settings).
- [x] 5.2 Run the full local check (format, lint, typecheck, unit, integration, build, e2e), all passing.
- [x] 5.3 Verify CI is green on the pull request.
