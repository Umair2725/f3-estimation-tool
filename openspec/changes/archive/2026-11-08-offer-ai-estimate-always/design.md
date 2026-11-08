# Design

## Context

There is one `TaskSuggestion` per Task. `requestAiGuess` overwrites it with `method: AI_GUESS` and leaves `matches` (the similar past work, with similarity) as they are. Today two places treat `method ∈ {NO_MATCH, AI_GUESS}` as meaning "no reliable match":
- the `requestAiGuess` and `askArchitect` guards in `src/server/matching/matching.ts`;
- the block in `task-matches.tsx` that shows Ask an Architect and the AI controls.

Once an AI estimate can replace a reliable match, `AI_GUESS` no longer implies that.

## Goals / Non-Goals

**Goals:**
- Offer the AI estimate on any Task that has a suggestion.
- Keep Ask an Architect tied to "no reliable match".
- Rename the visible wording.

**Non-Goals:**
- Showing a match and an AI estimate side by side.
- Changing how document fills choose between a match and a guess.
- Renaming internal identifiers (`AI_GUESS`, `aiGuessAction`, `requestAiGuess`, `GUESS_FAILED`), the DB enum or the spec requirement titles that say "AI guess".

## Decisions

1. **Derive "reliable match" from the stored matches, not the method.**
   - What: `hasReliableMatch = chooseSuggestion(storedMatches, embedder.threshold).method !== "NO_MATCH"`.
   - Where: it is computed in `getMatching` (it becomes a `reliableMatch` boolean on `SuggestionView`) and in `askArchitect`.
   - Why: no migration, and it is always consistent with what "Find again" would choose.
   - Alternative considered: storing the replaced method in a new column. Rejected, because it needs a migration and can go stale if the threshold changes.
2. **`requestAiGuess` requires only that a suggestion exists.**
   - The guard becomes "Find matches for this Task first" when there is none (the same message `decideSuggestion` uses).
   - This keeps a single row per Task and leaves `matches` intact.
3. **UI layout.**
   - The minutes field and the "AI estimate" / "Estimate again" button move out of the no-match block into their own row. That row shows whenever `canEdit && suggestion`.
   - Ask an Architect, the waiting text and the declined text show when `!suggestion.reliableMatch`.
   - The "AI estimates aren't set up" text shows only when there is no reliable match. On matched Tasks nothing is shown without a key, so the knowledge-base flow is not cluttered.
4. **Wording.** Visible strings move from "AI guess" to "AI estimate":
   - buttons: "AI estimate" / "Estimate again";
   - `GUESS_FAILED` → "The AI estimate failed. Try again.";
   - "AI estimates aren't set up";
   - the success message "AI estimate ready.";
   - the review item "… an AI estimate";
   - the document notice "from an AI estimate (check them)";
   - the Settings heading "AI estimate".

## Risks / Trade-offs

- [An estimator replaces a good match by mistake] → "Find again" restores it, and Sub tasks only change on Accept or Adjust.
- [Spec deltas edit requirements added by `structure-ai-guess`] → Archive that change before this one.

## Migration Plan

No schema or data migration. Existing `AI_GUESS` suggestions keep working: their stored matches decide whether Ask an Architect shows.
