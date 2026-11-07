## MODIFIED Requirements

### Requirement: No reliable match
When no entry reaches the similarity threshold, the Task SHALL be marked "No reliable match" and no historical numbers SHALL be shown as a suggestion. The editor SHALL be offered to ask an Architect for reference hours and, if an AI provider key is configured, an AI estimate (see "AI estimate on any matched Task") labelled "AI-generated, no historical reference" wherever it appears. Without a key, the tool SHALL say AI estimates aren't set up.

#### Scenario: Guess with a key
- **WHEN** a Task has no reliable match and the estimator clicks "AI estimate" with 60 minutes per round
- **THEN** proposed Sub tasks with Min and Max appear, labelled "AI-generated, no historical reference", each showing its rounds, the 60 minutes per round and its risk level, with the estimate's biggest risks below them

#### Scenario: No key
- **WHEN** no AI provider key is configured
- **THEN** the Task shows "No reliable match", the option to ask an Architect, and "AI estimates aren't set up"

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

### Requirement: Biggest risks of an AI guess
An AI guess SHALL return up to 3 biggest risks, each one sentence, stored with the suggestion and shown under the guess on the Estimate tab while it is the Task's suggestion. Each guessed Sub task's kind of work, base rounds, risk level and reason SHALL also be stored with the suggestion, so they can later be compared with actual hours.

#### Scenario: Risks shown
- **WHEN** a guess returns the risk "Client's offline conflict rules are unknown"
- **THEN** the Estimate tab shows it under the guess's Sub tasks, labelled "Biggest risks"

#### Scenario: Guess again replaces the guess
- **WHEN** the estimator clicks "Estimate again" with 90 minutes per round
- **THEN** the new estimate's Sub tasks, rounds, risks and the 90 minutes per round replace the old ones

### Requirement: Review attention for suggestions
The review page's items needing attention SHALL also list Tasks whose accepted suggestion was an AI estimate, Tasks marked "No reliable match" that have no Sub tasks with hours, and Tasks still waiting for an Architect's reference, each with a count and a link to the Task.

#### Scenario: AI guess flagged
- **WHEN** a request with one accepted AI estimate is in review
- **THEN** the items needing attention include "1 Task uses an AI estimate" with a link to it

#### Scenario: AI estimate over a reliable match flagged
- **WHEN** the estimator accepts an AI estimate that replaced a Confirmed benchmark suggestion, and the request goes to review
- **THEN** the items needing attention include "1 Task uses an AI estimate"

## ADDED Requirements

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
