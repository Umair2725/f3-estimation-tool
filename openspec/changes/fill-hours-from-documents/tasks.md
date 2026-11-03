# Tasks

## 1. Server

- [x] 1.1 `src/server/matching/matching.ts`: `fillHours` (match, else AI guess 4 at a time, recorded as Accepted; Tasks with Sub tasks untouched; a failed guess leaves the Task empty), sharing the Sub task replacement and the guess with Accept and "Get an AI guess". Verify integration tests: matched, guessed, failed guess, existing Sub tasks kept, Reject still works, AI not set up.
- [x] 1.2 `src/server/documents/apply.ts`: run `fillHours` after matching and return the counts with the others.

## 2. Pages

- [x] 2.1 Notice counts in `src/lib/documents/added-notice.ts` and the Estimate tab. The review button shows "Adding and estimating hours…". Verify unit tests for the wording and the address.

## 3. Verification

- [x] 3.1 Lint, typecheck, Prettier, unit, integration, build and e2e (the export filename test fails only in the cloud sandbox's browser, as before this change).
- [ ] 3.2 On UAT with the Claude key set: add the features of a real SOW and check each Task has hours, from past estimates or an AI guess, and the review lists the AI guesses.
- [ ] 3.3 Open a PR. Verify CI is green on the PR.
