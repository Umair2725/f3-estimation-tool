## ADDED Requirements

### Requirement: Default minutes per round
The estimate defaults SHALL include a default minutes per round for AI guesses, 60 without any Admin change. Admins SHALL be able to change it under Settings → Estimate defaults to a whole number from 1 to 480; other roles SHALL be refused with 403. A change SHALL apply to guesses made afterwards only.

#### Scenario: Fresh installation
- **WHEN** an estimator opens the AI guess option on a new installation
- **THEN** the minutes per round field is pre-filled with 60

#### Scenario: Admin changes it
- **WHEN** an Admin sets the default minutes per round to 45
- **THEN** guesses made afterwards are pre-filled with 45, and earlier guesses keep their hours and minutes per round

#### Scenario: Out of range
- **WHEN** an Admin sets the default minutes per round to 600
- **THEN** the change is refused with "Enter whole minutes from 1 to 480" and nothing is saved

#### Scenario: Non-Admin
- **WHEN** an Estimator calls the change-defaults action directly with a new minutes per round
- **THEN** the response is 403 and nothing changes
