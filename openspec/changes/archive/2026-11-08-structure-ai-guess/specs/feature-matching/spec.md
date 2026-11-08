## MODIFIED Requirements

### Requirement: No reliable match
When no entry reaches the similarity threshold, the Task SHALL be marked "No reliable match" and no historical numbers SHALL be shown as a suggestion. The editor SHALL be offered to ask an Architect for reference hours and, if an AI provider key is configured, to get an AI-only guess labelled "AI-generated, no historical reference" wherever it appears. Without a key, the tool SHALL say AI guesses aren't set up.

#### Scenario: Guess with a key
- **WHEN** a Task has no reliable match and the estimator asks for an AI guess with 60 minutes per round
- **THEN** proposed Sub tasks with Min and Max appear, labelled "AI-generated, no historical reference", each showing its rounds, the 60 minutes per round and its risk level, with the guess's biggest risks below them

#### Scenario: No key
- **WHEN** no AI provider key is configured
- **THEN** the Task shows "No reliable match", the option to ask an Architect, and "AI guesses aren't set up"

## ADDED Requirements

### Requirement: Minutes per round for an AI guess
Asking for an AI guess or a new guess SHALL require minutes per round, a whole number from 1 to 480, pre-filled with the default minutes per round (specs/estimate-defaults "Default minutes per round"). Guesses made when features are added from a requirement document SHALL use the default. The minutes per round used SHALL be stored with the guess.

#### Scenario: Pre-filled
- **WHEN** the default minutes per round is 60 and the estimator opens the AI guess option
- **THEN** the minutes per round field shows 60 and can be changed before guessing

#### Scenario: Invalid minutes
- **WHEN** the estimator asks for a guess with 0 or 30.5 minutes per round
- **THEN** it is refused with "Enter whole minutes from 1 to 480" and the Task is unchanged

#### Scenario: Document fill uses the default
- **WHEN** features are added from a requirement document and one has no reliable match, while the default is 45
- **THEN** its AI guess is sized at 45 minutes per round

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
- **THEN** the guess fails with "The AI guess failed. Try again or ask an Architect." and the Task keeps its current state

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
- **WHEN** the estimator clicks "Guess again" with 90 minutes per round
- **THEN** the new guess's Sub tasks, rounds, risks and the 90 minutes per round replace the old ones
