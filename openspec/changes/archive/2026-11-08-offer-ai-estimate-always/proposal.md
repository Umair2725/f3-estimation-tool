# Proposal

## Why

The rounds-based AI guess (agent-estimation, with minutes per round) is only offered when a Task has no reliable match. Estimators want it as a second opinion on every Task, including those with a knowledge-base match. They also want the feature named "AI estimate", which says more than "AI guess".

## What Changes

- An editor can ask for an AI estimate on any Task that has been matched (after "Find matches"), not only when there is "No reliable match". It works as before: Claude rates rounds and risk, and the estimator's minutes per round turns rounds into hours.
- On a Task with a reliable match, the AI estimate **replaces** the Task's suggestion. The Task's Sub tasks are untouched until Accept or Adjust. "Find again" brings the knowledge-base suggestion back. The similar past work list stays visible under the AI estimate.
- The AI estimate keeps the label "AI-generated, no historical reference", the review flag, the privacy rules and the sizing formula. Nothing about how it is sized changes.
- "Ask an Architect" is still offered only when no stored match reaches the similarity threshold, even after an AI estimate has replaced a reliable match.
- Visible wording changes:
  - The button "AI guess" becomes "AI estimate".
  - "Guess again" becomes "Estimate again".
  - "AI guesses aren't set up" becomes "AI estimates aren't set up".
  - "The AI guess failed. Try again or ask an Architect." becomes "The AI estimate failed. Try again."
  - The review item "N Task(s) use(s) an AI guess" becomes "… an AI estimate".
- Unchanged: Tasks added from a requirement document still get an automatic AI estimate only when they have no reliable match.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feature-matching`: the AI estimate is offered on every matched Task and replaces a reliable match's suggestion. The visible wording changes from "AI guess" to "AI estimate", and Ask an Architect depends on the stored matches rather than on the suggestion's method.

## Impact

- **Server:**
  - `src/server/matching/matching.ts`: `requestAiGuess` no longer refuses Tasks with a reliable match. `askArchitect` and the view decide "no reliable match" from the stored matches. The messages are renamed.
  - The review attention text is renamed.
- **UI:** `src/app/(app)/estimates/[id]/estimate/task-matches.tsx`: the AI estimate controls show for any suggestion, and the buttons are renamed.
- **Tests:** unit, integration and e2e tests that assert the old wording or the old refusal (`e2e/matching.spec.ts`, `matching.int.test.ts`, review tests).
- **Docs:** README and `docs/product-brief.md` wording.
- **No migration:** no schema or data change. Internal names (`AI_GUESS`, `aiGuessAction`) stay.
- **Order:** this change edits requirements added by `structure-ai-guess`, so archive `structure-ai-guess` first.
