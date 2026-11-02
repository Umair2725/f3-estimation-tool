# Spec Delta

## ADDED Requirements

### Requirement: Team level feeds benchmarks
When actual hours are saved for a delivered or in-delivery request whose hours are AI-era (not an imported pre-AI project), the person saving SHALL choose the team level: experienced, junior or mixed. The level SHALL be stored with the version.

#### Scenario: Level required
- **WHEN** the Tech Lead saves actuals for an AI-era project without choosing a level
- **THEN** it is refused with "Choose the team level"

#### Scenario: Imported project
- **WHEN** actuals are saved for an imported pre-AI project
- **THEN** no level is asked and no observations are added

### Requirement: Linked Sub tasks become observations
For each Sub task in a saved version that is linked to a benchmark and has actual hours, an observation SHALL be added to that benchmark with the actual hours, the version's team level, its date and the project, and the benchmark SHALL be recalculated. Saving a newer version SHALL replace the observations of the older version of the same request.

#### Scenario: Linked Sub task
- **WHEN** a Tech Lead saves actuals with level "experienced" and the Sub task "Sign up form", linked to FB-012, took 3.5 h
- **THEN** FB-012 gets an experienced observation of 3.5 h from that project, and is recalculated

#### Scenario: Newer version
- **WHEN** a version 2 of the same actuals is saved
- **THEN** version 1's observations are removed and version 2's are added
