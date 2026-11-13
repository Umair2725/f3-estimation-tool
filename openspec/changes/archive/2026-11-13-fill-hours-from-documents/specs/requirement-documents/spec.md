## ADDED Requirements

### Requirement: Hours filled in
When features are added from a document, each of their new Tasks SHALL get hours at once: a reliable match's Sub tasks when the knowledge base has one, otherwise an AI guess when AI guesses are set up. Each SHALL be recorded as accepted by the person who added the items, and SHALL stay open to Adjust, Reject and editing. Tasks that already have Sub tasks SHALL NOT be changed.

#### Scenario: Matched feature
- **WHEN** a feature added from a document matches an approved estimate's Task
- **THEN** its Task has that Task's Sub tasks and hours, each commented with the source, and the suggestion is recorded as Accepted by the person who added it

#### Scenario: No match, AI set up
- **WHEN** a feature added from a document has no reliable match and AI guesses are set up
- **THEN** its Task has the AI guess's Sub tasks, each labelled "AI-generated, no historical reference", and the review lists it under "AI guess"

#### Scenario: No match, no AI
- **WHEN** a feature added from a document has no reliable match and AI guesses aren't set up, or the guess fails
- **THEN** its Task stays "No reliable match" without hours, offering "Ask an Architect"

#### Scenario: Where the hours came from
- **WHEN** the Estimate tab opens after adding
- **THEN** the notice counts the Tasks with hours from past estimates, from an AI guess, and still without hours
