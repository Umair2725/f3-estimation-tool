# Tasks

## 1. Default minutes per round

- [x] 1.1 Add a Prisma migration and verify `npx prisma migrate deploy` applies it on a fresh database:
  - `estimate_defaults.minutes_per_round` (int, not null, default 60);
  - `task_suggestion.minutes_per_round` (int, nullable);
  - `task_suggestion.guess_risks` (text[], nullable).

  Update `prisma/schema.prisma` to match.
- [x] 1.2 Add `minutesPerRound` to `EstimateDefaults`, `defaultsSchema` (whole 1–480, "Enter whole minutes from 1 to 480"), `FALLBACK` and `readDefaults` in `src/server/estimate-defaults.ts`. Verify by extending `src/server/estimate-defaults.int.test.ts`:
  - an Admin saves 45 and it reads back;
  - 600 is refused with that message;
  - an Estimator gets 403.
- [x] 1.3 Add a "Default minutes per round" field to the Estimate defaults form (`settings/estimate-defaults/defaults-form.tsx`). Verify in the settings e2e test or by hand that it shows 60 on a fresh database and saves.

## 2. Rounds sizing logic

- [x] 2.1 In `src/lib/matching/ai-prompt.ts`, make these changes and credit agent-estimation (MIT) in a comment. Verify that `ai-prompt.test.ts` passes, including the unchanged privacy test and new tests rejecting a High-risk Sub task without a reason and 16 base rounds.
  - Replace `GuessSchema`: Sub tasks get `title`, `kind`, `baseRounds` (1–15), `risk` and `riskReason?`, plus `biggestRisks` (0–3); a non-Low risk without a reason is refused.
  - Rewrite `GUESS_SYSTEM` with rounds, the kinds and anchors, the risk levels, the anti-padding rule and "split above 15 rounds".
- [x] 2.2 Rewrite `guessToSubTasks(guess, minutesPerRound, note)` with the integer arithmetic in design.md. Verify with unit tests for the spec scenarios:
  - 4 base, High, 60 min → 4–6 h, with the exact comment;
  - 2 base, Low, 30 min → 1–1 h, with "2 rounds × 30 min, Low risk";
  - 3 base, Medium, 60 min → 3–3.9 h;
  - totals of 10 base and 14 effective rounds at 60 min → integration 1.5–2.1 h;
  - no integration Sub task for a single Sub task.

  What it does:
  - computes Min and Max in tenths;
  - builds the comments;
  - appends "Integration and wiring" for 2 or more Sub tasks;
  - returns the Sub tasks with `kind`, `baseRounds`, `risk` and `riskReason`, plus the risks.

## 3. Server and storage

- [x] 3.1 In `src/server/matching/matching.ts`, make these changes. Verify with `matching.int.test.ts` and a stubbed guess client:
  - `requestAiGuess` takes `minutesPerRound` and refuses values outside whole 1–480 with "Enter whole minutes from 1 to 480" before calling the AI;
  - `guessSubTasks` passes the minutes on;
  - `aiGuessData` stores the rounds in `suggested` and also stores `minutesPerRound` and `guessRisks`;
  - every other suggestion write clears them.

  The test checks that the stored minutes and risks are right, that "Guess again" with 90 replaces them, and that an invalid value leaves the Task unchanged.
- [x] 3.2 Make `fillHours` use `readDefaults().minutesPerRound`. Verify with an integration test: the default is set to 45, document features are added, and the guess is sized at 45.
- [x] 3.3 Expose `minutesPerRound`, `guessRisks` and the default minutes per round in the matching view model the Estimate tab reads. Verify with an integration-test assertion on the loaded data.

## 4. Interface

- [x] 4.1 In `task-matches.tsx` and `matching-actions.ts`:
  - add a "Minutes per round" number input, pre-filled with the default, next to "AI guess" / "Guess again", and pass it to `aiGuessAction`;
  - show the field error;
  - show a "Biggest risks" list under an AI guess.

  Verify by extending `e2e/matching.spec.ts` with a stubbed guess: the field shows 60, guessing with 60 shows the rounds comment and the risks, "Guess again" with 90 replaces them, and 0 shows "Enter whole minutes from 1 to 480".

## 5. Docs and checks

- [x] 5.1 Update the AI guess description in `README.md` and `docs/product-brief.md`: rounds, risk, integration, minutes per round, the Admin default and the credit to agent-estimation. Verify that the docs mention minutes per round and no longer say the AI gives hours.
- [x] 5.2 Run lint, the type check, the unit tests, the integration tests and `npm run build`, and verify that all pass.
- [x] 5.3 Smoke test with a real key: on a Task with no reliable match, guess at 60 and then at 30 minutes per round. Verify that the hours halve, that "Integration and wiring" is present, and that the review page still flags "uses an AI guess".

## Workflow follow-up

- Archive the change after review and merge.
- Once there are enough AI-era actual hours, propose a change that compares stored rounds with actual hours and suggests a realistic default minutes per round.
