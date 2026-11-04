## MODIFIED Requirements

### Requirement: No reliable match
When no entry reaches the similarity threshold, the Task SHALL be marked "No reliable match" and no historical numbers SHALL be shown as a suggestion. The editor SHALL be offered to ask an Architect for reference hours and, if an AI provider key is configured, to get an AI-only guess labelled "AI-generated, no historical reference" wherever it appears. Without a key, the tool SHALL say AI guesses aren't set up.

#### Scenario: Guess with a key
- **WHEN** a Task has no reliable match and the estimator asks for an AI guess
- **THEN** proposed Sub tasks with Min and Max appear, labelled "AI-generated, no historical reference", each showing its complexity band and risk level, with the guess's biggest risks below them

#### Scenario: No key
- **WHEN** no AI provider key is configured
- **THEN** the Task shows "No reliable match", the option to ask an Architect, and "AI guesses aren't set up"

## ADDED Requirements

### Requirement: How an AI guess is sized
An AI guess SHALL give each Sub task a complexity band (Simple, Moderate, Complex, Uncertain) and a risk level (Low, Medium, High, Very high), with a one-line reason when the risk is above Low; the AI SHALL NOT give hours. The tool SHALL set Min to the band's Min hours and Max to the band's Max hours times the risk factor, both rounded to tenths, from the AI guess sizing in effect when the guess is made (specs/estimate-defaults "AI guess sizing").

#### Scenario: Hours from band and risk
- **WHEN** the sizing has Moderate at 3–8 h and High at 1.5, and the AI rates a Sub task Moderate with High risk "SDK docs are sparse"
- **THEN** the Sub task is 3–12 h and its comment is "AI-generated, no historical reference · Moderate, High risk: SDK docs are sparse"

#### Scenario: Low risk needs no reason
- **WHEN** the AI rates a Sub task Simple with Low risk
- **THEN** the Sub task has the Simple band's hours unchanged and its comment is "AI-generated, no historical reference · Simple, Low risk"

#### Scenario: Answer without a reason
- **WHEN** the AI rates a Sub task above Low risk without a reason
- **THEN** the guess fails with "The AI guess failed. Try again or ask an Architect." and the Task keeps its current state

#### Scenario: Sizing changed later
- **WHEN** an Admin changes the Moderate band after a guess was made
- **THEN** that guess's hours are unchanged, and only guesses made afterwards use the new band

### Requirement: Integration Sub task in an AI guess
An AI guess with 2 or more Sub tasks SHALL get one more Sub task, "Integration and wiring", with Min and Max equal to the integration percentage of the other Sub tasks' total Min and total Max, rounded to tenths, and commented "AI-generated, no historical reference · Integration". A guess with one Sub task SHALL get none.

#### Scenario: Integration added
- **WHEN** a guess has Sub tasks totalling 10–20 h and the integration percentage is 15
- **THEN** the guess also has "Integration and wiring" at 1.5–3 h, and the suggestion totals 11.5–23 h

#### Scenario: Single Sub task
- **WHEN** a guess has only one Sub task
- **THEN** no integration Sub task is added

### Requirement: Biggest risks of an AI guess
An AI guess SHALL return up to 3 biggest risks, each one sentence, stored with the suggestion and shown under the guess on the Estimate tab while it is the Task's suggestion. Each guessed Sub task's band, risk level and reason SHALL also be stored with the suggestion, so they can later be compared with actual hours.

#### Scenario: Risks shown
- **WHEN** a guess returns the risk "Client's offline conflict rules are unknown"
- **THEN** the Estimate tab shows it under the guess's Sub tasks, labelled "Biggest risks"

#### Scenario: Guess again replaces risks
- **WHEN** the estimator clicks "Guess again"
- **THEN** the new guess's Sub tasks, bands and risks replace the old ones
