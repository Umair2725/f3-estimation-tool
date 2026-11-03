# Design

## Context

- `applyDocument` creates the features and their Tasks, then `computeSuggestions` stores a `TaskSuggestion` per Task (method, matches, suggested Sub tasks), decision Pending.
- Accept (`decideSuggestion`) replaces the Task's Sub tasks with the suggestion's. "Get an AI guess" (`requestAiGuess`) is offered only on "No reliable match" and replaces the suggestion with an AI one, which still waits for Accept.

## Decisions

### 1. Fill in after matching, in the same action
- `fillHours(actorId, requestId, taskIds)` runs after `computeSuggestions` for the new Tasks only. For each Task without Sub tasks: a suggestion with Sub tasks is applied as Accept would. A "No reliable match" Task gets an AI guess when AI guesses are set up, which is stored as the suggestion (method AI_GUESS) and applied.
- Each applied suggestion is stored as decision Accepted, decided by the person who clicked "Add to request", at that time. "Decisions are recorded" then holds without a new state, and Adjust and Reject still work.
- **Alternative considered:** a new "filled automatically" decision. More precise, but it needs a migration and changes to the review attention and every view of decisions. The person who added the items chose to add them, and the AI guesses are flagged in the review anyway.

### 2. AI guesses run in the request, 4 at a time
- The action waits for the guesses, so the estimator arrives at an Estimate tab that's already filled in. The button reads "Adding and estimating hours…".
- A failed guess is logged and leaves that Task empty. It doesn't fail the add.
- **Alternative considered:** guessing in the background after the response, with the Estimate tab polling. Faster to return, but it needs a "guessing" state per Task. Revisit if documents with many unmatched features make the wait too long.

### 3. Only for features added from a document
- "Find matches" keeps suggesting only, as specified, and features typed in the wizard aren't filled in. The product owner's ask is about extracted features. The same `fillHours` can serve a later "Fill hours" button.

## Risks / Trade-offs

- **Numbers nobody looked at:** AI guesses are labelled on every Sub task, listed in the review's items needing attention, and counted in the notice. Matched hours cite their source as before.
- **Wait time:** bounded by the 4 concurrent guesses. The failure of one guess costs only that Task's hours.
