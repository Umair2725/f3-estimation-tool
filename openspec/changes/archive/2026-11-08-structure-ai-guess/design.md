# Design

## Context

Today the guess runs as follows:
- `src/server/matching/ai-guess.ts` calls Claude through `messages.parse`, with a Zod output format.
- `src/lib/matching/ai-prompt.ts` holds the prompt and `GuessSchema`. The schema is `{ subTasks: [{ title, minHours, maxHours }] }`.
- `guessToSubTasks` turns hours into tenths.
- `guessSubTasks` in `src/server/matching/matching.ts` connects the two. It is used by:
  - `requestAiGuess`, behind the "AI guess" and "Guess again" buttons (`aiGuessAction` in `matching-actions.ts`);
  - `fillHours`, which runs when document features are added (change `fill-hours-from-documents`).
- `aiGuessData` stores the Sub tasks as `TaskSuggestion.suggested` JSON (`[{ title, minTenths, maxTenths, comment }]`), with totals.

The Admin defaults are one `estimate_defaults` row (id `default`). `src/server/estimate-defaults.ts` reads and validates them with a Zod `defaultsSchema`, and `settings/estimate-defaults/` edits them in one form.

The formula is agent-estimation's (MIT), credited in a code comment. We copy the idea, not its text. Its only fixed assumption we drop is the 3 minutes per round. See proposal.md, Why.

## Goals / Non-Goals

**Goals:**
- The guess's hours depend only on rounds and risk that Claude gives, the fixed agent-estimation factors, and a minutes per round that a person chose. The same answer at the same minutes always gives the same hours.
- Every guessed Sub task shows its rounds, minutes and risk reason, and these are stored for later comparison with actual hours.
- No change to who can guess, what is sent to Claude, or how a guess is labelled, accepted or flagged in review.

**Non-Goals:**
- Learning minutes per round from actual hours (F-24). That comes later and only reads the stored values.
- Waves, parallel agents or coordination rounds from agent-estimation.
- Admin-editable anchors, risk factors or integration share.

## Decisions

### Claude gives rounds, the code computes hours
- **Choice:** `GuessSchema` becomes
  `{ subTasks: [{ title, kind, baseRounds, risk, riskReason? }], biggestRisks: string[] }`.
  - `kind` and `risk` are Zod enums.
  - `baseRounds` is an integer from 1 to 15.
  - A `superRefine` rejects a non-Low risk without a reason.
  - A schema failure is a failed guess with the existing `GUESS_FAILED` message.
- **Kind of work:** `kind` is not checked against its anchor range. The anchors guide Claude in the prompt, and `kind` is stored for calibration. Failing a guess because 5 rounds was called "Moderate" would only make guesses fail more often.
- **Alternative:** Keep Claude's hours and add a reason. That doesn't make the conversion assumption explicit, which was the point of the change.

### Min = base rounds, Max = effective rounds
- **Choice:**
  - Min uses base rounds.
  - Max uses base rounds × risk factor.
  - The integration Sub task uses 15% of each total.
- **Why:** The brief says Min is usually close to reality, so it is the no-risk case. Agent-estimation's risk-adjusted total becomes the upper end of our range.
- **Alternative:** Ask Claude for a range of rounds. That is two numbers to drift instead of one, and it moves away from the method.

### Exact integer arithmetic
- **Choice:** Keep everything in integers until the final rounding to tenths of an hour, so 3 rounds × 1.3 at 60 min is exactly 3.9 h.
  - Risk factors are stored in tenths (10, 13, 15, 20).
  - Hours in tenths are `rounds × minutes / 6`.
  - `minTenths = round(baseRounds × minutes / 6)`
  - `maxTenths = round(baseRounds × factorTenths × minutes / 60)`
  - Integration `minTenths = round(Σbase × 15 × minutes / 600)`
  - Integration `maxTenths = round(Σ(base × factorTenths) × 15 × minutes / 6000)`
- **Comment format:**
  - rounds are shown as "4–6 rounds", or "2 rounds" when Min and Max are equal;
  - effective rounds keep one decimal ("3–3.9 rounds").

### Minutes per round is an argument of the guess
- **Choice:**
  - `requestAiGuess(actor, requestId, taskId, minutesPerRound)` validates a whole number from 1 to 480 before calling Claude, and refuses with "Enter whole minutes from 1 to 480".
  - `fillHours` reads the default from `readDefaults()`.
  - `guessSubTasks(request, task, minutesPerRound)` passes it to `guessToSubTasks`.
  - Minutes are not sent to Claude. Rounds are Claude's judgment and the conversion is ours, so the AI's answer doesn't depend on the minutes.
- **UI:** In `task-matches.tsx`, a small number input labelled "Minutes per round", pre-filled with the default from the matching view model, sits next to the "AI guess" / "Guess again" button.

### Default minutes per round is one more estimate default
- **Choice:**
  - Add `minutes_per_round int NOT NULL DEFAULT 60` to `estimate_defaults`.
  - Add `minutesPerRound` to `EstimateDefaults`, `defaultsSchema` (whole 1–480, message "Enter whole minutes from 1 to 480"), `FALLBACK` and the existing defaults form.
- **Why:** It is a single number that Admins manage next to the other defaults. It reuses the form, the action and the 403 check.
- **Alternative:** A separate settings section. That means more code for one field.

### What is stored with the suggestion
- **Sub task elements:** each element of `TaskSuggestion.suggested` gains optional `kind`, `baseRounds`, `risk` and `riskReason`. Older rows don't have them.
- **New nullable columns:**
  - `minutes_per_round int`
  - `guess_risks text[]`

  Both are written by `aiGuessData` and set to null by every other suggestion write (re-matching, Accept of a match).
- **Comment:** The Sub task comment carries rounds, minutes and risk as text, so an accepted Task keeps its explanation after it is no longer tied to the suggestion.

### Prompt
- **Choice:** The system prompt explains:
  - what a round is (one think, write, run, verify and fix cycle);
  - the four kinds with their anchors;
  - the risk levels;
  - agent-estimation's anti-padding rule: raise risk only for a named reason, never "to be safe";
  - "split anything above 15 rounds into more Sub tasks";
  - "development only".
- **Unchanged:** The user message (`guessPrompt`) stays the same, so the privacy test holds.

## Risks / Trade-offs

- **A round is sized for an AI agent, so the right minutes per round for a Folio3 developer is unknown.**
  - Mitigation:
    - The estimator chooses it for each guess.
    - It is shown on every Sub task and stored.
    - The guess stays labelled "AI-generated, no historical reference" and flagged in review.
    - Stored rounds allow later calibration.
- **Estimators may enter very different minutes for similar work.**
  - Mitigation: The Admin default gives a shared starting point, and reviewers see the value in each comment.
- **Claude may rate everything High risk.**
  - Mitigation: A reason is required, the prompt states the anti-padding rule, and the reasons are visible to the reviewer.
- **Totals change for users used to the old guesses.**
  - Mitigation: Only new guesses change. Stored guesses and accepted Sub tasks are untouched.

## Migration Plan

1. The migration adds `estimate_defaults.minutes_per_round` (default 60) and the nullable `task_suggestion.minutes_per_round` and `task_suggestion.guess_risks`. It is backwards compatible, with no data rewrite.
2. Deploy as usual: `npx prisma migrate deploy`, then the app.
3. **Rollback:** Redeploy the previous app version. It ignores the extra columns and JSON fields.
