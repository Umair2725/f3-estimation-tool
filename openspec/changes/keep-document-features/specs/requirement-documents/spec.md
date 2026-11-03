## MODIFIED Requirements

### Requirement: Duplicates and filled-in values
A proposed feature whose name matches one already in the request, ignoring letter case and surrounding spaces, SHALL be flagged "Already in the request" and unticked. A proposed request detail for a field already filled in SHALL be unticked and show both values; ticking it adds the document's values to a list field (such as hosting) and replaces a single value (such as the project name).

#### Scenario: Existing value kept by default
- **WHEN** the request already has hosting "Azure" and the document proposes "AWS"
- **THEN** the hosting row shows "Azure (current)" and "AWS (document)", unticked

#### Scenario: Duplicate feature
- **WHEN** the request already has "User login" and the document proposes "user login"
- **THEN** the proposed feature is flagged "Already in the request" and unticked

### Requirement: After adding
The added features SHALL get estimate Tasks and be matched at once, and the estimator SHALL be taken to the request's Estimate tab. The document SHALL then show when and by whom its items were added, and SHALL be able to be reviewed and added again, with items already added shown as added.

#### Scenario: Matched straight away
- **WHEN** 12 features have just been added from a document
- **THEN** the Estimate tab shows a suggestion or "No reliable match" for each of their Tasks without clicking "Find matches"

#### Scenario: Review again
- **WHEN** the estimator reopens the review of a document already added
- **THEN** the items added earlier show "Added" and are unticked

#### Scenario: Estimate tab opens after adding
- **WHEN** the estimator clicks "Add to request" with 12 features ticked
- **THEN** the request's Estimate tab opens with the Tasks of the 12 features
- **AND** a Task with no reliable match offers "Ask an Architect" and, when AI guesses are set up, an AI guess

## ADDED Requirements

### Requirement: Removed features offered again
A feature added earlier from a document but no longer in the request (no feature with its name, ignoring letter case and surrounding spaces) SHALL be offered again in the document's review, unticked and labelled "Removed from the request", instead of showing "Added".

#### Scenario: Feature removed after adding
- **WHEN** the estimator added "Appointment booking" from a document, later removed it from the request, and reopens the review
- **THEN** "Appointment booking" shows "Removed from the request", unticked, and ticking it and clicking "Add to request" adds it again
