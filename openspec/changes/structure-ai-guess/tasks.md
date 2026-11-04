# Tasks

## 1. Sizing table

- [ ] 1.1 Add a Prisma migration and verify `npx prisma migrate deploy` applies it on a fresh database:
  - `estimate_defaults.ai_guess_sizing` (jsonb, not null, default = the starting values in design.md);
  - `task_suggestion.guess_risks` (text[], nullable).

  Update `prisma/schema.prisma` to match.
- [ ] 1.2 In `src/server/estimate-defaults.ts`, add three things. Verify with new unit tests for valid input, Min above Max, factors out of order, an integration percentage of 51, and invalid stored JSON.
  - the sizing Zod schema, with tenths, Min ≤ Max per band, non-decreasing factors from 1.0 to 5.0, and integration 0–50;
  - `readGuessSizing` (falls back to the starting values on invalid data and logs a warning);
  - `updateGuessSizing` (requires `settings.manage`).
- [ ] 1.3 Extend `src/server/estimate-defaults.int.test.ts`. Verify it passes with `npm run test:int` or the project's integration command:
  - an Admin saves the sizing and it reads back;
  - an Estimator gets 403 and nothing changes;
  - the existing defaults are untouched.

## 2. Guess sizing logic

- [ ] 2.1 In `src/lib/matching/ai-prompt.ts`, make these changes and credit agent-estimation (MIT) in a comment. Verify that `ai-prompt.test.ts` passes, including the unchanged privacy test and a new test that a High-risk Sub task without a reason is rejected.
  - Replace `GuessSchema`: Sub tasks get `title`, `band`, `risk` and `riskReason?`, plus `biggestRisks` (0–3); a non-Low risk without a reason is refused.
  - Rewrite `GUESS_SYSTEM` with the bands, the risk levels, the anti-padding rule and "split anything bigger than Uncertain".
- [ ] 2.2 Rewrite `guessToSubTasks(guess, sizing, note)`. Verify with unit tests for the spec scenarios:
  - Moderate at High → 3–12 h, with the comment text;
  - Simple at Low;
  - Complex at Medium → 8–20.8 h;
  - a total of 10–20 h at 15% → integration of 1.5–3 h;
  - no integration Sub task for a single Sub task.

  What it does:
  - computes Min and Max in tenths;
  - builds the comment "AI-generated, no historical reference · <Band>, <Risk> risk[: reason]";
  - appends "Integration and wiring" for 2 or more Sub tasks;
  - returns the Sub tasks with `band`, `risk` and `riskReason`, plus the risks.

## 3. Server and storage

- [ ] 3.1 In `src/server/matching/matching.ts`, make these changes. Verify that `matching.int.test.ts` passes with a stubbed guess client: a guess stores the bands in `suggested` and the risks in `guessRisks`, "Guess again" replaces them, and `fillHours` stores the same data.
  - `guessSubTasks` reads the sizing and passes it in.
  - `aiGuessData` stores the ratings in `suggested` and the risks in `guessRisks`.
  - Every other suggestion write sets `guessRisks` to null.
- [ ] 3.2 Expose `guessRisks` in the matching view model the Estimate tab reads. Verify with an integration-test assertion on the loaded data.

## 4. Interface

- [ ] 4.1 In `src/app/(app)/estimates/[id]/estimate/task-matches.tsx`, show a "Biggest risks" list under an AI guess. The band and risk already appear in each Sub task's comment. Verify by extending `e2e/matching.spec.ts` with a stubbed guess: the risks appear, and "Guess again" replaces them.
- [ ] 4.2 Add an "AI guess sizing" section to Settings → Estimate defaults, with its own Save and field errors. Verify by extending the settings e2e or integration tests: an Admin saves Moderate at 4–10 h, and Min above Max shows "Min can't be more than Max".

## 5. Docs and checks

- [ ] 5.1 Update the AI guess description in `README.md` and `docs/product-brief.md` (bands, risk, integration, Admin sizing, credit to agent-estimation). Verify that the docs mention the sizing page and no longer say the AI gives hours.
- [ ] 5.2 Run `npm run lint`, `npm run typecheck` (or `tsc --noEmit`), the unit tests, the integration tests and `npm run build`, and verify that all pass.
- [ ] 5.3 Smoke test with a real key: on a request with a Task that has no reliable match, click "AI guess". Verify that the Sub tasks show bands and risks, that an "Integration and wiring" Sub task is present, that the totals match the sizing table, and that the review page still flags "uses an AI guess".

## Workflow follow-up

- Archive the change after review and merge.
- Once there are enough AI-era actual hours, propose a calibration change that compares the stored ratings with actuals and suggests new band hours.
