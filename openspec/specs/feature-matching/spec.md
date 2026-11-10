# feature-matching Specification

## Purpose

Defines how the tool suggests hours for each Task of an estimate from Folio3's approved past work: the knowledge index built from approved estimates and Architect references, similarity search with cited sources, the order in which a suggestion is chosen, the "No reliable match" case with a request to an Architect for reference hours and an optional, clearly labelled AI-only guess, the estimator's Accept, Adjust or Reject decision, and the privacy rules for AI calls.

## Requirements

### Requirement: Knowledge index
The knowledge index SHALL hold one entry per Task of each request's latest approved version, plus one entry per benchmark that is usable for suggestions (it has experienced-developer hours and is not Retired), and nothing else: drafts, requests in review, unapproved later versions and benchmarks without AI-era hours SHALL never be indexed. A benchmark's entry SHALL be updated whenever its hours, status or text change.

#### Scenario: Approval adds entries
- **WHEN** a request with two Tasks is approved as version 1
- **THEN** the index has two entries for that request, both for version 1

#### Scenario: New version replaces old entries only when approved
- **WHEN** that request is reopened as a Draft v2 and its hours are changed
- **THEN** the index still has the version 1 entries, and they are replaced only when version 2 is approved

#### Scenario: Actual hours recorded later
- **WHEN** actual hours are saved for an indexed delivered project
- **THEN** its entries show the actual hours of their Sub tasks

#### Scenario: Benchmark gets hours
- **WHEN** a benchmark with no AI-era hours receives experienced hours of 4
- **THEN** it is added to the index; when it is retired, it is removed

### Requirement: What an index entry records
Each index entry SHALL record its source (request and version, or benchmark ID), project and client when it has them, date, part and stack, Task and Sub task titles, Min and Max, whether its hours are pre-AI, AI-era or a Confirmed or Draft benchmark, and actual hours when recorded. A benchmark whose part is Any SHALL match Tasks on every part.

#### Scenario: Imported entry
- **WHEN** an imported delivered project is indexed
- **THEN** its entries are marked pre-AI and carry the project, client, approval date and actual hours

#### Scenario: Any part
- **WHEN** a benchmark has part Any and a Mobile Task matches it
- **THEN** it is among the Mobile Task's matches

### Requirement: Local embeddings
Index entries and searches SHALL use text embeddings computed on Folio3's own server by an open-source model; estimate text SHALL NOT be sent to any outside service to compute them. A rebuild command SHALL recreate the whole index from the approved versions and Architect references.

#### Scenario: Rebuild
- **WHEN** an operator runs the rebuild
- **THEN** every latest approved version and every Architect reference is indexed and no other entries remain

### Requirement: Find matches
On the estimate page, anyone with a role SHALL be able to see the matches of a Task, and people who may edit the request SHALL be able to find matches for one Task or for all Tasks. For each Task the tool SHALL show up to 5 of the most similar entries on the same part, excluding the request itself.

#### Scenario: Matches for a Task
- **WHEN** the estimator finds matches for the Backend Task "User login" and an approved request has a Backend Task "Login and sign-up"
- **THEN** that Task is listed with its similarity, project, date, hours and a link to its request

#### Scenario: Own request excluded
- **WHEN** a reopened request finds matches
- **THEN** its own approved version is not among them

### Requirement: How a match is shown
Each match SHALL show its similarity as a percentage, its source (project and client, or "Benchmark <ID>" with its status), date, part and stack, Min and Max, actual hours when recorded, and a link to the source request or benchmark.

#### Scenario: Architect reference match
- **WHEN** a match is the Draft benchmark created from Dev Architect's reference hours
- **THEN** it shows "Benchmark <ID> · draft" and its date, with a link to the benchmark

#### Scenario: Benchmark match
- **WHEN** a match is Confirmed benchmark FB-012
- **THEN** it shows "Benchmark FB-012 · confirmed" and its last update, with a link to the benchmark

### Requirement: Suggestion order and labels
Among matches at or above the similarity threshold, each Task's suggestion SHALL use the first available of: a Confirmed benchmark, a Draft benchmark, AI-era actual hours, an approved AI-era estimate ("Approved AI-era estimate"), the most similar pre-AI match; otherwise "No reliable match". It SHALL state its source, for benchmarks as "Benchmark <ID>, confirmed by <name>, based on <N> projects, updated <YYYY-MM>" or "Draft benchmark <ID>, not confirmed yet".

#### Scenario: Confirmed benchmark first
- **WHEN** a Task matches Confirmed benchmark FB-012 and an imported pre-AI Task above the threshold
- **THEN** the suggestion uses FB-012's experienced–junior hours and says "Benchmark FB-012, confirmed by <name>, based on <N> projects, updated <YYYY-MM>"

#### Scenario: Architect reference first
- **WHEN** a Task matches the Draft benchmark created from an Architect's reference hours and an imported pre-AI Task above the threshold
- **THEN** the suggestion uses the Draft benchmark and says "Draft benchmark <ID>, not confirmed yet"

#### Scenario: AI-era actuals before pre-AI
- **WHEN** a similar Task from a delivered AI-era project has actual hours of 38 and there is no benchmark
- **THEN** the suggestion uses those hours and says "Based on actual hours (AI era)" with the source

#### Scenario: Pre-AI match
- **WHEN** the only similar Tasks come from imported pre-AI projects
- **THEN** the suggestion uses the most similar one's hours and shows the pre-AI label with its source

### Requirement: Every number is cited or labelled
Every suggested number SHALL either cite at least one source or be labelled "AI-generated, no historical reference". A pre-AI suggestion SHALL be shown unchanged and labelled "Pre-AI hours: the AI reduction isn't applied yet".

#### Scenario: Pre-AI label
- **WHEN** a suggestion comes from an imported project
- **THEN** it shows the source and "Pre-AI hours: the AI reduction isn't applied yet"

### Requirement: No reliable match
When no entry reaches the similarity threshold, the Task SHALL be marked "No reliable match" and no historical numbers SHALL be shown as a suggestion. The editor SHALL be offered to ask an Architect for reference hours and, if an AI provider key is configured, an AI estimate (see "AI estimate on any matched Task") labelled "AI-generated, no historical reference" wherever it appears. Without a key, the tool SHALL say AI estimates aren't set up.

#### Scenario: Guess with a key
- **WHEN** a Task has no reliable match and the estimator clicks "AI estimate" with 60 minutes per round
- **THEN** proposed Sub tasks with Min and Max appear, labelled "AI-generated, no historical reference", each showing its rounds, the 60 minutes per round and its risk level, with the estimate's biggest risks below them

#### Scenario: No key
- **WHEN** no AI provider key is configured
- **THEN** the Task shows "No reliable match", the option to ask an Architect, and "AI estimates aren't set up"

### Requirement: Ask an Architect for reference hours
For a Task with no reliable match, people who may edit the request SHALL be able to ask an active Architect for reference hours, with an optional note. The request for reference SHALL record the feature name and description, part and stack, who asked, the Architect and when; the Architect SHALL be notified in the app. While it is open, the Task SHALL show "Waiting for <Architect>'s reference", and the same Task SHALL NOT have two open requests.

#### Scenario: Ask
- **WHEN** the estimator asks Dev Architect for reference hours for the Backend Task "Offline sync"
- **THEN** Dev Architect sees it under "Reference hours requested" on the Reviews page and on Home, and the Task shows "Waiting for Dev Architect's reference"

#### Scenario: Not an Architect
- **WHEN** the chosen person is a Tech Lead
- **THEN** it is refused with "Choose an Architect"

### Requirement: Architect adds reference hours
Only the Architect asked SHALL be able to answer: either add reference hours (a title, an optional description, the part and stack, and at least one Sub task with Min and Max, which they may edit from the feature as asked) or decline with a reason. Added reference hours SHALL be stored as a Draft benchmark with the next free ID, the request's part and stack, the Sub tasks as its breakdown, experienced hours equal to the Sub tasks' total Min and junior hours equal to their total Max.

#### Scenario: Someone else answers
- **WHEN** a different Architect tries to answer the request
- **THEN** it is refused with 403

#### Scenario: Stored as a benchmark
- **WHEN** Dev Architect adds "Offline sync" for Backend (Node.js) with Sub tasks totalling 16–24 h
- **THEN** a Draft benchmark "Offline sync" exists with 16–24 h and the Sub tasks as its breakdown

### Requirement: References are kept for future matching
The benchmark created from reference hours SHALL be indexed at once for all future matching. The person who asked SHALL be notified, and the Task's matches SHALL be refreshed so the benchmark becomes its suggestion. A declined request SHALL notify the person who asked, with the reason.

#### Scenario: Reference added
- **WHEN** Dev Architect adds "Offline sync" for Backend (Node.js) with Sub tasks totalling 16–24 h
- **THEN** the estimator is notified, the Task's suggestion becomes that Draft benchmark at 16–24 h, and a later request with a similar Backend Task also gets it as a match

#### Scenario: Declined
- **WHEN** Dev Architect declines with "Too vague, needs the client's sync rules"
- **THEN** the estimator is notified with that reason and the Task shows "No reliable match" again with the option to ask

### Requirement: Accept, Adjust or Reject
People who may edit the request SHALL be able to Accept, Adjust (with a required reason) or Reject each suggestion. Accept and Adjust SHALL replace the Task's Sub tasks with the suggestion's, each commented with its source ("From <project> v<version>, <part label>", "From benchmark <ID>") or "AI-generated, no historical reference", and then editable. Sub tasks from a benchmark SHALL stay linked to it. Nothing SHALL change the hours without one of these actions.

#### Scenario: Accept
- **WHEN** the estimator accepts a pre-AI suggestion from "Patient portal MVP" v1
- **THEN** the Task's Sub tasks are replaced by the source's, each commented "From Patient portal MVP v1, Backend (Node.js)", and the decision is stored as Accepted

#### Scenario: Benchmark link kept
- **WHEN** the estimator accepts benchmark FB-012
- **THEN** the new Sub tasks are commented "From benchmark FB-012" and linked to FB-012, so their actual hours can become observations

#### Scenario: Adjust without a reason
- **WHEN** the estimator chooses Adjust without a reason
- **THEN** it is refused with "Say why you're adjusting this suggestion"

#### Scenario: Reject
- **WHEN** the estimator rejects a suggestion
- **THEN** the Task's Sub tasks are unchanged and the decision is stored as Rejected

#### Scenario: Locked request
- **WHEN** someone tries to accept a suggestion while the request is In review
- **THEN** it is refused with "This request can no longer be edited"

### Requirement: Decisions are recorded
Each decision SHALL be stored with its method, the sources with their similarity, the suggested hours, the reason when adjusted, who decided and when.

#### Scenario: Adjusted decision
- **WHEN** the estimator adjusts with "Client wants SSO too"
- **THEN** the stored decision is Adjusted, with that reason, the method, the sources and the estimator's name and time

### Requirement: Review attention for suggestions
The review page's items needing attention SHALL also list Tasks whose accepted suggestion was an AI estimate, Tasks marked "No reliable match" that have no Sub tasks with hours, and Tasks still waiting for an Architect's reference, each with a count and a link to the Task.

#### Scenario: AI guess flagged
- **WHEN** a request with one accepted AI estimate is in review
- **THEN** the items needing attention include "1 Task uses an AI estimate" with a link to it

#### Scenario: AI estimate over a reliable match flagged
- **WHEN** the estimator accepts an AI estimate that replaced a Confirmed benchmark suggestion, and the request goes to review
- **THEN** the items needing attention include "1 Task uses an AI estimate"

### Requirement: Privacy of AI calls
Only the request's own project details and feature text SHALL be sent to the AI provider for a guess; other requests' estimates, Architect references and client names SHALL NOT be sent. AI calls SHALL use the configured, approved provider only, and the key SHALL be read from the server's settings, never shown in the interface.

#### Scenario: Guess prompt
- **WHEN** an AI guess is requested for "Offline sync" on a Northwind request
- **THEN** the text sent contains that request's feature, part and stack, and no other request's project, client or hours

### Requirement: Minutes per round for an AI guess
Asking for an AI guess or a new guess SHALL require minutes per round, a whole number from 1 to 480, pre-filled with the default minutes per round (specs/estimate-defaults "Default minutes per round"). Guesses made when features are added from a requirement document SHALL use the default. The minutes per round used SHALL be stored with the guess.

#### Scenario: Pre-filled
- **WHEN** the default minutes per round is 6 and the estimator opens the AI guess option
- **THEN** the minutes per round field shows 6 and can be changed before guessing

#### Scenario: Invalid minutes
- **WHEN** the estimator asks for a guess with 0 or 30.5 minutes per round
- **THEN** it is refused with "Enter whole minutes from 1 to 480" and the Task is unchanged

#### Scenario: Document fill uses the default
- **WHEN** features are added from a requirement document and one has no reliable match, while the default is 45
- **THEN** its AI guess is sized at 45 minutes per round

### Requirement: Progress while an AI estimate runs
While an AI estimate the estimator asked for is running, the Task SHALL show a spinner with "Claude is estimating this Task…", and its "AI estimate" or "Estimate again" button SHALL read "Estimating…". The Task's other match actions SHALL be disabled until the estimate ends. When it ends, the progress SHALL be replaced by the estimate or the error.

#### Scenario: Estimating
- **WHEN** the estimator clicks "AI estimate" and Claude has not answered yet
- **THEN** the Task shows the spinner and "Claude is estimating this Task…", and Accept, Find again and the button are disabled

#### Scenario: Estimate ends
- **WHEN** Claude answers, or the estimate is refused
- **THEN** the spinner is gone and the estimate's Sub tasks, or the error, are shown

### Requirement: How an AI guess is sized
An AI guess SHALL give each Sub task a kind of work (Boilerplate 1–2 rounds, Moderate 3–5, Exploratory 5–10, High uncertainty 8–15), whole base rounds from 1 to 15, and a risk level (Low 1.0, Medium 1.3, High 1.5, Very high 2.0) with a one-line reason when above Low; the AI SHALL NOT give hours. Min SHALL be base rounds and Max base rounds times the risk factor, each converted as rounds × minutes per round ÷ 60 and rounded to tenths of an hour.

#### Scenario: Hours from rounds and risk
- **WHEN** the AI gives a Sub task 4 base rounds with High risk "SDK docs are sparse" and the minutes per round is 60
- **THEN** the Sub task is 4–6 h and its comment is "AI-generated, no historical reference · 4–6 rounds × 60 min, High risk: SDK docs are sparse"

#### Scenario: Low risk needs no reason
- **WHEN** the AI gives a Sub task 2 base rounds with Low risk and the minutes per round is 30
- **THEN** the Sub task is 1–1 h and its comment is "AI-generated, no historical reference · 2 rounds × 30 min, Low risk"

#### Scenario: Fractional effective rounds
- **WHEN** the AI gives a Sub task 3 base rounds with Medium risk and the minutes per round is 60
- **THEN** the Sub task is 3–3.9 h

#### Scenario: Answer without a reason
- **WHEN** the AI gives a Sub task a risk above Low without a reason, or rounds outside 1 to 15
- **THEN** the estimate fails with "The AI estimate failed. Try again." and the Task keeps its current suggestion and Sub tasks

### Requirement: Integration Sub task in an AI guess
An AI guess with 2 or more Sub tasks SHALL get one more Sub task, "Integration and wiring", whose Min is 15% of the other Sub tasks' total base rounds and whose Max is 15% of their total effective rounds, converted to hours with the same minutes per round and commented "AI-generated, no historical reference · Integration, 15% of rounds". A guess with one Sub task SHALL get none.

#### Scenario: Integration added
- **WHEN** a guess's Sub tasks total 10 base rounds and 14 effective rounds at 60 minutes per round
- **THEN** the guess also has "Integration and wiring" at 1.5–2.1 h

#### Scenario: Single Sub task
- **WHEN** a guess has only one Sub task
- **THEN** no integration Sub task is added

### Requirement: Biggest risks of an AI guess
An AI guess SHALL return up to 3 biggest risks, each one sentence, stored with the suggestion and shown under the guess on the Estimate tab while it is the Task's suggestion. Each guessed Sub task's kind of work, base rounds, risk level and reason SHALL also be stored with the suggestion, so they can later be compared with actual hours.

#### Scenario: Risks shown
- **WHEN** a guess returns the risk "Client's offline conflict rules are unknown"
- **THEN** the Estimate tab shows it under the guess's Sub tasks, labelled "Biggest risks"

#### Scenario: Guess again replaces the guess
- **WHEN** the estimator clicks "Estimate again" with 90 minutes per round
- **THEN** the new estimate's Sub tasks, rounds, risks and the 90 minutes per round replace the old ones

### Requirement: AI estimate on any matched Task
When AI estimates are set up, people who may edit the request SHALL be offered "AI estimate", with minutes per round, on every Task that has a suggestion, whether or not it has a reliable match. It SHALL replace the Task's suggestion with an AI estimate, sized and labelled as for "No reliable match", without changing the Task's Sub tasks until Accept or Adjust. The similar past work list SHALL stay. "Find again" SHALL bring back the knowledge-base suggestion.

#### Scenario: Estimate over a reliable match
- **WHEN** a Task's suggestion is the Confirmed benchmark FB-012 at 16–24 h and the estimator clicks "AI estimate" with 60 minutes per round
- **THEN** the suggestion becomes the AI estimate labelled "AI-generated, no historical reference", the similar past work still lists FB-012, and the Task's Sub tasks are unchanged

#### Scenario: Accepted match then AI estimate
- **WHEN** the estimator has accepted a match and then asks for an AI estimate
- **THEN** the Task keeps the accepted Sub tasks, and the AI estimate waits for Accept, Adjust or Reject

#### Scenario: Find again restores the match
- **WHEN** the estimator clicks "Find again" on a Task whose AI estimate replaced FB-012
- **THEN** the suggestion is FB-012 again

#### Scenario: Not matched yet
- **WHEN** a Task has never been matched
- **THEN** only "Find matches" is offered, not "AI estimate"

#### Scenario: Ask an Architect stays for no reliable match only
- **WHEN** a Task's AI estimate replaced a reliable match
- **THEN** "Ask an Architect" is not offered, and asking is refused with "Ask an Architect only when there is no reliable match"

#### Scenario: Document fills unchanged
- **WHEN** features with a reliable match are added from a requirement document
- **THEN** their hours come from the match, not from an AI estimate
