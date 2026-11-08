# Tasks

## 1. Server

- [x] 1.1 In `src/server/matching/matching.ts`, add `reliableMatch` to `SuggestionView`, computed from the stored matches with `chooseSuggestion` and the embedder threshold. Verify with an integration test that a benchmark match gives `true` and a NO_MATCH gives `false`.
- [x] 1.2 Let `requestAiGuess` run on any Task with a suggestion, with "Find matches for this Task first" when there is none, and keep the stored matches. Verify with integration tests that an AI estimate replaces a Confirmed benchmark suggestion, leaves the Sub tasks unchanged and keeps the matches, and that "Find again" brings the benchmark back.
- [x] 1.3 Base the `askArchitect` guard on the stored matches, not the method. Verify with an integration test that asking after an AI estimate replaced a reliable match is refused with "Ask an Architect only when there is no reliable match".
- [x] 1.4 Rename the server-side visible strings:
  - `GUESS_FAILED` → "The AI estimate failed. Try again.";
  - "AI estimates aren't set up";
  - the review item "… an AI estimate" in `src/lib/review/attention.ts`;
  - the document notice "from an AI estimate (check them)" in `src/lib/documents/added-notice.ts`;
  - the success message "AI estimate ready." in `matching-actions.ts`.

  Update the unit and integration tests that assert them, and verify that `npm test` passes.

## 2. Estimate tab and Settings

- [x] 2.1 In `task-matches.tsx`, show the minutes field and the "AI estimate" / "Estimate again" button whenever the editor sees a suggestion. Show Ask an Architect, the waiting and declined texts, and "AI estimates aren't set up" only when `reliableMatch` is false. Verify by checking the screen in the browser.
- [x] 2.2 Rename the Settings → Estimate defaults section heading to "AI estimate" and its help text. Verify by checking the page.
- [x] 2.3 Update `e2e/matching.spec.ts`:
  - rename the button text in the existing tests;
  - add a test: "Work orders" (matched to Field service app) gets an AI estimate from the stub, shows "AI-generated, no historical reference" with the match still in Similar past work, offers no Ask an Architect, and returns to "Based on actual hours (AI era)" after "Find again".

  Verify that the e2e suite passes.

## 3. Docs and checks

- [x] 3.1 Update the AI guess wording and the "any matched Task" behavior in `README.md` and `docs/product-brief.md`. Verify that both read correctly.
- [x] 3.2 Run lint, the type check, `npm run format:check`, unit and integration tests, the build and e2e (`--workers=2`). Verify that all pass.

## Workflow follow-up

- Archive `structure-ai-guess` before archiving this change.
