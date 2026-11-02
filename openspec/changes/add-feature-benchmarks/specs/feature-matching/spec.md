# Spec Delta

## MODIFIED Requirements

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

### Requirement: How a match is shown
Each match SHALL show its similarity as a percentage, its source (project and client, or "Benchmark <ID>" with its status), date, part and stack, Min and Max, actual hours when recorded, and a link to the source request or benchmark.

#### Scenario: Architect reference match
- **WHEN** a match is the Draft benchmark created from Dev Architect's reference hours
- **THEN** it shows "Benchmark <ID> · draft" and its date, with a link to the benchmark

#### Scenario: Benchmark match
- **WHEN** a match is Confirmed benchmark FB-012
- **THEN** it shows "Benchmark FB-012 · confirmed" and its last update, with a link to the benchmark

### Requirement: Suggestion order and labels
Among matches at or above the similarity threshold, each Task's suggestion SHALL use the first available of: a Confirmed benchmark; a Draft benchmark; AI-era actual hours from delivered work; an approved AI-era estimate ("Approved AI-era estimate"); the most similar pre-AI match. When none reaches the threshold, it SHALL be "No reliable match". The suggestion SHALL always state which it used: a Confirmed benchmark as "Benchmark <ID>, confirmed by <name>, based on <N> projects, updated <YYYY-MM>", a Draft benchmark as "Draft benchmark <ID>, not confirmed yet".

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
People who may edit the request SHALL be able to Accept, Adjust or Reject each suggestion; Adjust SHALL require a reason. Accept and Adjust SHALL replace the Task's Sub tasks with the suggestion's Sub tasks, each with a comment naming its source ("From <project> v<version>, <part label>", "From benchmark <ID>") or "AI-generated, no historical reference"; the estimator can then edit them. Sub tasks taken from a benchmark SHALL stay linked to it. Nothing SHALL change the hours without one of these actions.

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
