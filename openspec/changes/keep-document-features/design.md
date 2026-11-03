# Design

## Context

- The edit page renders `<Wizard key={id} …>`. The wizard copies its props into `useState` once (`state`, `saved`), so later renders of the page with fresh data don't reach the form. Next.js keeps the client component mounted across `router.replace`/`Link` navigations within the same request, so "Back to Requirements" returns to the old copy.
- Every wizard move saves the current step. `saveFeatures` (`src/server/estimation-requests.ts`) updates features by `key` (the feature id), creates rows without a known key, and then runs `deleteMany` on every feature of the request whose id wasn't in the form. A feature the form never saw is therefore deleted, and `syncTasks` removes its Tasks.
- `applyDocument` updates the request row (project name, lists, considerations), so `updatedAt` changes whenever items are added from a document. The same holds for the wizard's own saves.
- `buildReview` treats a proposal item as added if its id is in `addedItemIds`, whether or not the feature still exists.
- Observed on UAT (request "test3"): 15 features were added at 13:39:00 and deleted by a step 4 save at 13:40:32 that sent only "web app".

## Goals / Non-Goals

**Goals:**
- No wizard save can delete or overwrite something the person didn't change in that form.
- Returning to the wizard shows the request as it is now.
- After adding from a document, the estimator lands where the hours are: the Estimate tab.
- A lost or removed document feature can be added again.

**Non-Goals:**
- Claude proposing Sub tasks (decided: knowledge-based hours only).
- Changing Finish's completeness rule (decided: keep it).
- Full conflict handling for two people editing the same step at once. The guard here covers features; other steps reload when the wizard is returned to.

## Decisions

### 1. The wizard reloads when the request changed elsewhere
- The page passes `version` (the request's `updatedAt`, ISO string) to the wizard.
- The wizard keeps `knownVersion`: the version it loaded, then the `savedAt` each of its own saves returns. Saves return the request's new `updatedAt`, so check that `saveStepAction` returns exactly that value, and make it do so if not.
- On render, if `props.version` is newer than `knownVersion`, the wizard resets `state` and `saved` from `props.initial`, sets `knownVersion`, and shows a short status: "Updated with changes made elsewhere." The current step, `furthest` and any message stay.
- Unsaved typing on the current step: `go()` saves before it navigates, and no navigation happens without a save. The only way to get a newer version with unsaved edits is a refresh triggered by something else, such as the documents panel's polling `router.refresh()` while a document is read. In that case the current step's unsaved values are kept, and only the other steps and the saved baseline are reloaded. That keeps typing safe without losing the new data.
- **Alternative considered:** `key={id + updatedAt}`, a full remount. Simpler, but a remount drops the "Before you finish" list, errors and focus, and it would throw away typing on a background refresh.

### 2. Saving step 4 only removes what the form removed
- The step 4 payload adds `loadedIds`: the ids of the features the form loaded (its baseline `saved[4]`, refreshed on reload).
- `saveFeatures` deletes only features whose id is in `loadedIds` and not in the submitted list. Features created after the form loaded are kept and stay after the submitted ones in position order.
- `loadedIds` is required in `step4Schema` (at most 300 ids). The wizard is the only caller.
- This guard holds even when the reload in decision 1 can't help, such as two tabs.
- **Alternative considered:** rejecting a stale save with "This request changed, reload". That's safer for every field, but it adds a failure the person has to deal with, for a case that decision 1 already covers for one tab.

### 3. "Add to request" opens the Estimate tab
- On success the review editor runs `router.push(`/estimates/${requestId}/estimate?notice=document-added`)`. The Estimate tab shows the count notice (for example "Added 15 features, 7 details …") once.
- Matching already runs inside `applyDocument` before the action returns, so the Tasks show suggestions or "No reliable match" on arrival. A matching failure still leaves the features added, and "Find matches" works as today.
- "Ask an Architect" and the AI guess already exist on unmatched Tasks, so there are no changes there.

### 4. "Added" means still in the request
- `buildReview` marks a feature item added only when its id is in `addedItemIds` and the request has a feature with its normalised name.
- An item in `addedItemIds` whose feature is gone gets `removed: true`, is unticked, and shows "Removed from the request". Ticking it and adding creates it again. `addedItemIds` stays a set union, so this is idempotent.
- This also recovers the UAT request "test3": its 15 features become addable again.

## Risks / Trade-offs

- **Comparing versions by timestamp:** two saves in the same millisecond are unlikely. ISO strings compare correctly as strings when they come from the same source.
- **Renamed features in the review:** a feature added from a document and then renamed in the request shows "Removed from the request", because the name no longer matches. That's acceptable: it's unticked and labelled, so nothing is added twice by accident.
- **Background refresh while typing:** covered by keeping the current step's unsaved values (decision 1). This branch needs its own test.
