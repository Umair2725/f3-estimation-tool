## MODIFIED Requirements

### Requirement: Accept, Adjust or Reject
People who may edit the request SHALL be able to Accept, Adjust (with a required reason) or Reject each suggestion. Accept and Adjust SHALL replace the Task's Sub tasks with the suggestion's, each commented with its source ("From <project> v<version>, <part label>", "From benchmark <ID>") or "AI-generated, no historical reference", and then editable. Sub tasks from a benchmark SHALL stay linked to it. Nothing SHALL change the hours without one of these actions, except the hours filled in when features are added from a requirement document (specs/requirement-documents "Hours filled in").

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
