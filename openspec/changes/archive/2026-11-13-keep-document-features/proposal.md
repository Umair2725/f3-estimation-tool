# Proposal

## Why

Features added from a requirement document disappear. During UAT on 2026-11-03 the product owner added 15 features from a document, clicked "Back to Requirements" and then Finish. The wizard was still holding the list it had loaded before the document was added, and saving it deleted the 15 features. Finish then asked for "at least one feature", and the review showed the features as already added, so they couldn't be added again. This breaks F-09's main promise: features from the client's document go straight into the estimate.

## What Changes

- The wizard picks up changes made elsewhere since it was opened, such as items added from a document. Returning to it shows the current request instead of the copy it held before.
- Saving the Requirements step removes only the features the person removed in that form. A feature added elsewhere after the form loaded is kept, even if the form never showed it.
- After "Add to request", the estimator is taken to the Estimate tab. There each new feature already has its Tasks with matched hours, and Tasks with no reliable match offer "Ask an Architect" or an AI guess (both already built).
- A document's review offers a feature again when it was added earlier but is no longer in the request. It's unticked and labelled "Removed from the request", so a feature that was lost or deliberately removed can be added back.
- Unchanged, as decided with the product owner:
  - Finish still requires at least one feature; features added from a document count.
  - Claude does not propose Sub tasks. Each feature becomes one Task per part, and hours and Sub tasks come from the tool's knowledge (past work and feature hours).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `estimation-requests`: a new requirement that the wizard keeps changes made elsewhere, so saving a step never undoes them.
- `requirement-documents`: "After adding" opens the Estimate tab; "Duplicates and filled-in values" offers a removed feature again.

## Impact

- `src/app/(app)/estimates/wizard/wizard.tsx` and the edit page: reload the wizard when the request changed elsewhere.
- `src/server/estimation-requests.ts` (`saveFeatures`) and `src/lib/estimation/schemas.ts` (`step4Schema`): the form sends the feature ids it loaded, and only those can be removed.
- `src/lib/documents/review.ts` (`buildReview`) and `src/server/documents/apply.ts`: "added" means added and that feature is still in the request.
- `src/app/(app)/estimates/[id]/documents/[documentId]/review-editor.tsx`: go to the Estimate tab after adding.
- Tests: unit tests for the review and the step 4 schema, an integration test for `saveFeatures`, and an e2e test of the full flow: add from a document, go back to Requirements, Finish, then check the features and Tasks are kept.
- `prisma/schema.prisma`: one additive column, `RequestDocument.addedFeatures` (which feature each proposal item was added as), so merged and renamed features still count as added. No new packages.
