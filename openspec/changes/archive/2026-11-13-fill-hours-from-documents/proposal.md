# Proposal

## Why

The point of reading a client's SOW or requirement document is an estimate with hours. Today the features extracted from a document arrive without hours. They are matched, but each match waits as a suggestion for someone to click Accept. Tasks with no match wait for someone to click "Get an AI guess". The product owner tested it on 2026-11-03 and found the extracted features had no hours. Their rule: extracted features get hours from our past estimates when one matches, and an AI guess when none does.

## What Changes

- "Add to request" fills in the hours of every new Task straight away:
  - with a reliable match in the knowledge base, the match's Sub tasks and hours, each citing its source as today;
  - with no reliable match and AI guesses set up, an AI guess labelled "AI-generated, no historical reference";
  - otherwise (AI not set up, or the guess failed), no hours: the Task stays "No reliable match" with "Ask an Architect".
- Each fill is recorded as accepted by the person who clicked "Add to request", with its method and sources. They can still Adjust or Reject it, and edit the Sub tasks.
- Tasks that already have Sub tasks are never overwritten.
- The Estimate tab notice says where the hours came from, for example "Hours: 9 Tasks from past estimates, 5 Tasks from an AI guess (check them), 1 Task still without hours."
- The review's "needs attention" list already shows Tasks that use an AI guess, so reviewers still see every number without a historical source.
- Unchanged: "Find matches" on the Estimate tab still only suggests, and features typed by hand are not filled in automatically.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `feature-matching`: "Accept, Adjust or Reject" allows one exception, hours filled in when features are added from a document.
- `requirement-documents`: a new requirement, "Hours filled in".

## Impact

- `src/server/matching/matching.ts`: new `fillHours`, sharing the Sub task replacement and the AI guess with Accept and "Get an AI guess".
- `src/server/documents/apply.ts`: calls `fillHours` after matching and returns the counts.
- `src/lib/documents/added-notice.ts`, the Estimate tab notice and the review's "Add to request" button ("Adding and estimating hours…").
- AI guesses run 4 at a time. A document with many unmatched features takes longer to add (roughly 10 to 30 seconds for 20 guesses).
- No migration and no new packages.
