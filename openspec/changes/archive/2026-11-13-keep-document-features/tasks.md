# Tasks

## 1. Pure logic

- [x] 1.1 `src/lib/estimation/schemas.ts`: add `loadedIds` (required, at most 300 ids) to `step4Schema`. Verify unit tests: a payload without `loadedIds` is refused, and one with it parses.
- [x] 1.2 `src/lib/documents/review.ts`: `buildReview` marks a feature as added only while the request has a feature with its normalised name; otherwise `removed: true`, unticked. Verify unit tests for the spec scenarios "Review again", "Duplicate feature" and "Feature removed after adding".

- [x] 1.3 `src/app/(app)/estimates/wizard/reload.ts`: the pure reload rules (newer version, keep the current step's unsaved values, append features added elsewhere on step 4, swap keys for saved ids). Verify unit tests.

## 2. Server

- [x] 2.1 `src/server/estimation-requests.ts` (`saveFeatures`): delete only features whose id is in `loadedIds` and not submitted; features created after the form loaded stay, after the submitted ones. Verify integration tests: "Feature added in another tab" (a feature created after the baseline survives a step 4 save, and so do its Tasks), and "Removing a feature still works" (the feature and its Tasks go).
- [x] 2.2 Check that the step save result's `savedAt` equals the request's new `updatedAt`, and make it so if not. Verify with an integration test that compares the two after a save.

- [x] 2.3 `applyDocument` records `addedFeatures` (item id to feature id, migration `20261103120000_document_added_features`) and `getDocumentReview` passes it and the feature ids to `buildReview`. The step 4 save returns `featureIds`. Verify an integration test: renamed in the request it still shows "Added"; deleted, it shows "Removed from the request".

## 3. Wizard and pages

- [x] 3.1 The edit page passes `version` (the request's `updatedAt`). The wizard keeps `knownVersion` and, when a newer version arrives, reloads `state` and `saved` from the props. It keeps the current step's unsaved values and shows "Updated with changes made elsewhere". The step 4 save sends `loadedIds` from `saved[4]`. Verify in the e2e test in 4.1, plus a check that the Finish list and errors survive a save.
- [x] 3.2 Review editor: after a successful "Add to request", open `/estimates/<id>/estimate?notice=document-added`. The Estimate tab shows the added counts once. The review shows "Removed from the request" on removed features. Verify in the e2e test in 4.1.

## 4. Verification

- [x] 4.1 E2E with `DOCUMENT_READER=stub`: on the Requirements step, type a feature without saving, upload a document, add its features, land on the Estimate tab, then check the Tasks show a suggestion or "No reliable match". Go back to Requirements: the document's features and the typed one are listed. Finish succeeds without "Add at least one feature". Remove one feature, save, reopen the review: it shows "Removed from the request".
- [x] 4.2 Run lint, typecheck, Prettier, unit, integration, the build and e2e (twice), all green.
- [x] 4.3 On UAT, restart with the new build, open the request "test3", reopen its document review, and add the 15 features again. Check they stay after "Back to Requirements" and Finish, and that the Estimate tab shows their Tasks with hours or "No reliable match".
- [x] 4.4 Open a PR. Verify CI is green on the PR.

## Workflow follow-up

- Merge with the product owner's OK, then archive `keep-document-features` (sync `estimation-requests` and `requirement-documents`) on a `chore/archive-…` branch.
