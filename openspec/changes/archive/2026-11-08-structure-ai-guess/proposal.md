# Proposal

## Why

When a Task has no reliable match, the AI guess asks Claude for free-form Min and Max hours per Sub task. The numbers change from one run to the next, carry no reason, leave out integration work, and hide the assumption behind them.

The open-source agent-estimation method (MIT, ZhangHanDong/agent-estimation) estimates in **rounds**: one think, write, run and fix cycle. It uses fixed anchors, a risk coefficient with a stated reason, and a separate integration share, and it converts to time only at the end. We adopt that formula as is. The one difference is the time per round: agent-estimation's fixed 3 minutes is replaced by a **minutes per round** value that the estimator enters for each guess. The assumption behind the hours is then explicit, and the estimator owns it.

## What Changes

- **What Claude gives for each Sub task** (still 2 to 8 Sub tasks):
  - a **kind of work**, with agent-estimation's anchors: Boilerplate 1–2 rounds, Moderate 3–5, Exploratory 5–10, High uncertainty 8–15;
  - a whole number of **base rounds**, from 1 to 15;
  - a **risk level**: Low 1.0, Medium 1.3, High 1.5, Very high 2.0, with a one-line reason whenever the risk is above Low.

  Claude no longer gives hours.
- **How the tool works out the hours.** Min and Max are converted to hours with hours = rounds × minutes per round ÷ 60, rounded to tenths.
  - Min = base rounds.
  - Max = effective rounds, which is base rounds × the risk factor.
- **Integration.** A guess with 2 or more Sub tasks gets one more Sub task, "Integration and wiring". It is 15% of the other Sub tasks' total base rounds (its Min) and total effective rounds (its Max). This is the middle of agent-estimation's 10–20%.
- **Minutes per round.** Clicking "AI guess" or "Guess again" asks for **minutes per round**, a whole number from 1 to 480. For example, 60 means one round takes an hour. The field is pre-filled with the Admin default.
- **Default minutes per round.** Admins set this under Settings → Estimate defaults. It starts at 60. Guesses made automatically when features are added from a requirement document use it.
- **What is stored and shown.**
  - The minutes per round, each Sub task's kind, rounds and risk, and up to 3 **biggest risks** are stored with the suggestion.
  - Each Sub task's comment shows them, for example "AI-generated, no historical reference · 4–6 rounds × 60 min, High risk: SDK docs are sparse".
  - The biggest risks are shown under the guess.
- **Fixed values.** The rounds anchors, risk factors and integration share are agent-estimation's and are not editable, so the formula stays the method's.
- **Out of scope.** The stored rounds can later be compared with AI-era actual hours (F-24) to learn a realistic minutes per round. Calibrating it automatically is out of scope.
- **Unchanged:**
  - the "AI-generated, no historical reference" label;
  - the review page's "uses an AI guess" flag;
  - privacy (only the request's own details are sent);
  - the model;
  - hours filled in when features are added from a document (they use the same guess).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feature-matching`:
  - "No reliable match": the guess asks for minutes per round and shows rounds, risks and biggest risks.
  - New requirements on how a guess is sized in rounds, the integration Sub task and the biggest risks.
- `estimate-defaults`: a new requirement, "Default minutes per round", which Admins edit.

## Impact

- `src/lib/matching/ai-prompt.ts`:
  - new system prompt and `GuessSchema` (kind, base rounds, risk and reason per Sub task, plus biggest risks);
  - `guessToSubTasks` converts rounds to hours with the minutes per round and adds the integration Sub task.
- `src/server/matching/matching.ts`:
  - `requestAiGuess` takes and validates minutes per round;
  - `fillHours` uses the Admin default;
  - `aiGuessData` stores rounds, minutes and risks.
- `src/server/estimate-defaults.ts` and `src/app/(app)/settings/estimate-defaults/`: one new field, default minutes per round.
- `src/app/(app)/estimates/[id]/estimate/task-matches.tsx` and `matching-actions.ts`: the minutes per round input next to "AI guess" and "Guess again", and the biggest risks under a guess.
- Prisma migration:
  - `estimate_defaults.minutes_per_round` (default 60);
  - nullable `minutes_per_round` and `guess_risks` columns on `task_suggestion`.
- Works alongside the in-progress change `fill-hours-from-documents`. It calls the same guess, and the two changes touch different requirements of `feature-matching`.
- No new packages. One call to Claude per guess, as before.
