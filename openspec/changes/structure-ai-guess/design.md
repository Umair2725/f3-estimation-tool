# Design

## Context

Today the guess runs as follows:
- `src/server/matching/ai-guess.ts` calls Claude through `messages.parse`, with a Zod output format.
- `src/lib/matching/ai-prompt.ts` holds the prompt and `GuessSchema`. The schema is `{ subTasks: [{ title, minHours, maxHours }] }`.
- `guessToSubTasks` turns hours into tenths.
- `guessSubTasks` in `src/server/matching/matching.ts` connects the two. It is used by "AI guess" / "Guess again" (`requestAiGuess`) and by `fillHours`, which runs when document features are added (change `fill-hours-from-documents`).
- `aiGuessData` stores the Sub tasks as `TaskSuggestion.suggested` JSON (`[{ title, minTenths, maxTenths, comment }]`), with totals.

The Admin defaults are one `estimate_defaults` row (id `default`). `src/server/estimate-defaults.ts` reads and validates them, and `settings/estimate-defaults/` edits them.

The method comes from agent-estimation (MIT) and is credited in a code comment. We copy its idea, not its text: the model picks categories and the code does the arithmetic. Its unit (rounds of about 3 minutes) is not used. See proposal.md, Why.

## Goals / Non-Goals

**Goals:**
- The guess's hours depend only on categories that Claude picks and a table that Admins own. Two guesses with the same ratings give the same hours.
- Every guessed Sub task carries its reason, and the ratings are stored, so they can be compared with actual hours later.
- No change to who can guess, what is sent to Claude, or how a guess is labelled, accepted or flagged in review.

**Non-Goals:**
- Automatic calibration from actual hours or benchmarks (F-24). That comes later and only reads the stored ratings.
- Waves, parallel agents or wallclock time from agent-estimation.
- Different sizing per part, stack or developer level. One table for now.

## Decisions

### Claude picks categories, the code computes hours
- **Choice:** `GuessSchema` becomes
  `{ subTasks: [{ title, band, risk, riskReason? }], biggestRisks: string[] }`,
  with `band` and `risk` as Zod enums. A zod `superRefine` rejects a non-Low risk without a reason. That counts as a failed guess with the existing `GUESS_FAILED` message.
- **Why:** Structured output already enforces the enums. The arithmetic becomes a pure function that can be tested without the network.
- **Alternatives:**
  - Keep Claude's hours and only add a reason. The numbers would still drift and couldn't be tuned.
  - Ask Claude for hours and clamp them to the band. Two sources of truth, hard to explain.

### Risk widens Max only
- **Choice:**
  - Min = band Min.
  - Max = band Max × factor.
  - The integration Sub task applies no risk factor.
- **Why:** The product brief says Min is usually close to reality. Risk is about how much worse it can get, not about the best case. Agent-estimation multiplies the whole estimate, but our quotes carry a range, so widening Max is the honest equivalent.
- **Alternative:** Multiply both ends. That raises the low end of every risky Task in the quote with no evidence for it.

### Integration as an extra Sub task
- **Choice:** For 2 or more Sub tasks, append "Integration and wiring" at `integrationPercent` of the summed Min and of the summed Max. These are the risk-adjusted values of the other Sub tasks, and the result is rounded to tenths.
- **Why:** It is visible, editable and removable like any other Sub task, and the totals and the review stay correct without special cases.
- **Alternative:** Inflate each Sub task by the percentage. That hides the cost, which is the anti-pattern the method warns about.

### Sizing stored as one JSON column on `estimate_defaults`
- **Choice:** Add `ai_guess_sizing jsonb NOT NULL`. The migration writes the starting values.
- **Format:** Hours are stored in tenths and factors in tenths, so the values are exact integers:
  ```
  { bands: { SIMPLE: {min:10,max:30}, MODERATE: {min:30,max:80}, COMPLEX: {min:80,max:160}, UNCERTAIN: {min:160,max:320} },
    riskFactors: { LOW:10, MEDIUM:13, HIGH:15, VERY_HIGH:20 }, integrationPercent: 15 }
  ```
- **Reading and saving:**
  - A Zod schema in `estimate-defaults.ts` validates it on read. On invalid data it falls back to the starting values and logs a warning.
  - A separate `updateGuessSizing` action saves it with the same `settings.manage` check. The current defaults form and its tests stay untouched.
- **Rounding:** Factors are multiplied in integer tenths with `Math.round(maxTenths * factorTenths / 10)`, so 80 tenths × 1.3 = 104 tenths = 10.4 h.
- **Alternatives:**
  - A new table with one row per band. More migration and join code for 9 numbers.
  - Constants in code. Admins couldn't tune them, which is the point of the change.

### Ratings and risks stored with the suggestion
- **Choice:**
  - Each element of `TaskSuggestion.suggested` gains optional `band`, `risk` and `riskReason`. Older rows don't have them, and that is fine.
  - A new nullable `guess_risks text[]` column holds the biggest risks. It is cleared whenever the suggestion is rewritten by a non-guess method (re-matching, Accept of a match).
  - The Sub task comment carries the band and risk as text, so a Task keeps its explanation after Accept, when it is no longer tied to the suggestion.
- **Why:** The existing JSON already holds the suggested Sub tasks, so this needs no new table. A column for the risks keeps them queryable and easy to show.

### Prompt
- **Choice:** The system prompt explains:
  - the four bands in words, without hours, so Claude doesn't anchor on our numbers;
  - the four risk levels;
  - the anti-padding rule: rate risk only for a named reason;
  - "development only".
- **Unchanged:** The user message (`guessPrompt`) stays the same, so the privacy test holds.

## Risks / Trade-offs

- **The starting band hours are educated guesses, not calibrated.**
  - Mitigation:
    - Admins can change them.
    - The ratings are stored for later calibration.
    - The guess stays labelled "AI-generated, no historical reference" and flagged in review.
- **Coarse bands can't express a 40-hour Sub task.**
  - Mitigation: Uncertain reaches 32 h, and up to 64 h at Very high risk. The prompt tells Claude to split anything larger into more Sub tasks.
- **Totals change for users used to the old guesses.**
  - Mitigation: Only new guesses change. Stored guesses and accepted Sub tasks are untouched.
- **Claude may rate everything High to be safe.**
  - Mitigation: A reason is required, the prompt states the anti-padding rule, and the reasons are visible to the reviewer.

## Migration Plan

1. The migration adds `estimate_defaults.ai_guess_sizing` with the starting values as its default and `task_suggestion.guess_risks` as nullable. It is backwards compatible, with no data rewrite.
2. Deploy as usual: `npx prisma migrate deploy`, then the app.
3. **Rollback:** Redeploy the previous app version. The extra column and the JSON fields are ignored by it.
