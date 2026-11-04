# Proposal

## Why

When a Task has no reliable match, the AI guess asks Claude for free-form Min and Max hours per Sub task. The numbers change from one run to the next, carry no reason, leave out integration work, and can't be tuned as Folio3 learns what AI-era work really takes. The open-source agent-estimation method (MIT, ZhangHanDong/agent-estimation) shows a steadier approach. The model picks a fixed complexity band and a risk level with a stated reason, integration is a separate line, and the arithmetic stays outside the model. We take that method but keep our unit, developer hours, because these numbers go into client quotes. Agent-estimation's own unit, minutes of an agent working alone, doesn't fit a quote.

## What Changes

- The AI guess still proposes 2 to 8 Sub tasks. For each one, Claude now picks:
  - a **complexity band**: Simple, Moderate, Complex or Uncertain;
  - a **risk level**: Low, Medium, High or Very high;
  - a one-line **risk reason** whenever the risk is above Low.

  Claude no longer gives hours.
- The tool works out the hours itself:
  - Min is the band's Min.
  - Max is the band's Max times the risk factor (Low 1.0, Medium 1.3, High 1.5, Very high 2.0).
  - Both are rounded to tenths of an hour.
- A guess with 2 or more Sub tasks gets one more Sub task, "Integration and wiring". It is sized at a set percentage of the other Sub tasks' Min and Max (default 15%).
- The guess also returns up to 3 **biggest risks**. They are shown with the guess on the Estimate tab.
- Each guessed Sub task's comment keeps "AI-generated, no historical reference" and adds its band and risk, for example "AI-generated, no historical reference · Moderate, High risk: SDK docs are sparse".
- Admins can edit the sizing under Settings → Estimate defaults → AI guess sizing: Min and Max hours per band, the four risk factors and the integration percentage. Changes apply to guesses made afterwards. Hours already guessed stay as they are.
- The band and risk of each guessed Sub task are stored with the suggestion, so the sizing can later be checked against actual hours (F-24). Calibrating the table from actual hours automatically is out of scope.
- Unchanged:
  - the "AI-generated, no historical reference" label;
  - the review page's "uses an AI guess" flag;
  - privacy (only the request's own details are sent);
  - the model and the "Guess again" button;
  - hours filled in when features are added from a document (they use the same guess).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feature-matching`:
  - "No reliable match": the guess shows bands, risk reasons and biggest risks.
  - New requirement, "How an AI guess is sized".
- `estimate-defaults`: new requirement, "AI guess sizing", which Admins edit.

## Impact

- `src/lib/matching/ai-prompt.ts`: new system prompt and `GuessSchema` (band, risk and reason per Sub task, plus biggest risks). `guessToSubTasks` turns them into hours with the sizing table and adds the integration Sub task.
- `src/server/matching/matching.ts`: `guessSubTasks` loads the sizing table. `aiGuessData` stores the bands and the risks.
- `src/server/estimate-defaults.ts` and `src/app/(app)/settings/estimate-defaults/`: an "AI guess sizing" section with validation. Admin only.
- `src/app/(app)/estimates/[id]/estimate/task-matches.tsx`: shows the biggest risks under an AI guess.
- Prisma migration:
  - new sizing columns on `estimate_defaults`;
  - a nullable `guess_risks` column on `task_suggestion`.
- Works alongside the in-progress change `fill-hours-from-documents`. It calls the same `guessSubTasks`, and the two changes touch different requirements of `feature-matching`.
- No new packages. One call to Claude per guess, as before.
