## ADDED Requirements

### Requirement: AI guess sizing
The AI guess sizing SHALL hold Min and Max hours for each complexity band, a factor for each risk level and an integration percentage. Without any Admin change it SHALL be: Simple 1–3 h, Moderate 3–8 h, Complex 8–16 h, Uncertain 16–32 h; risk factors Low 1.0, Medium 1.3, High 1.5, Very high 2.0; integration 15%.

#### Scenario: Fresh installation
- **WHEN** an AI guess is made on a new installation and rates a Sub task Complex with Medium risk
- **THEN** the Sub task is 8–20.8 h

### Requirement: Admins change the AI guess sizing
Admins SHALL be able to change the AI guess sizing under Settings → Estimate defaults, in an "AI guess sizing" section. Hours SHALL be 0.1–999 in tenths, with each band's Min at most its Max. Risk factors SHALL be 1.0–5.0 in tenths and never fall as the risk level rises. The integration percentage SHALL be a whole number from 0 to 50. Other roles SHALL be refused with 403.

#### Scenario: Change a band
- **WHEN** an Admin sets Moderate to 4–10 h
- **THEN** AI guesses made afterwards size Moderate Sub tasks from 4–10 h, and earlier guesses keep their hours

#### Scenario: Min above Max
- **WHEN** an Admin sets Complex to 20–16 h
- **THEN** the change is refused with "Min can't be more than Max" on the Complex band and nothing is saved

#### Scenario: Factors out of order
- **WHEN** an Admin sets High to 1.2 while Medium is 1.3
- **THEN** the change is refused with "A higher risk can't have a lower factor" and nothing is saved

#### Scenario: Non-Admin
- **WHEN** an Estimator calls the change-sizing action directly
- **THEN** the response is 403 and nothing changes
