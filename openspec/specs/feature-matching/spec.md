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
When no entry reaches the similarity threshold, the Task SHALL be marked "No reliable match" and no historical numbers SHALL be shown as a suggestion. The editor SHALL be offered to ask an Architect for reference hours and, if an AI provider key is configured, to get an AI-only guess labelled "AI-generated, no historical reference" wherever it appears. Without a key, the tool SHALL say AI guesses aren't set up.

#### Scenario: Guess with a key
- **WHEN** a Task has no reliable match and the estimator asks for an AI guess
- **THEN** proposed Sub tasks with Min and Max appear, labelled "AI-generated, no historical reference"

#### Scenario: No key
- **WHEN** no AI provider key is configured
- **THEN** the Task shows "No reliable match", the option to ask an Architect, and "AI guesses aren't set up"

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
The review page's items needing attention SHALL also list Tasks whose accepted suggestion was an AI-only guess ("AI guess"), Tasks marked "No reliable match" that have no Sub tasks with hours, and Tasks still waiting for an Architect's reference, each with a count and a link to the Task.

#### Scenario: AI guess flagged
- **WHEN** a request with one accepted AI guess is in review
- **THEN** the items needing attention include "1 Task uses an AI guess" with a link to it

### Requirement: Privacy of AI calls
Only the request's own project details and feature text SHALL be sent to the AI provider for a guess; other requests' estimates, Architect references and client names SHALL NOT be sent. AI calls SHALL use the configured, approved provider only, and the key SHALL be read from the server's settings, never shown in the interface.

#### Scenario: Guess prompt
- **WHEN** an AI guess is requested for "Offline sync" on a Northwind request
- **THEN** the text sent contains that request's feature, part and stack, and no other request's project, client or hours
