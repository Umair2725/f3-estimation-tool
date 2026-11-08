# estimate-defaults Specification

## Purpose
Defines the Admin-managed defaults every new estimate starts from: QA, PM and bug-fixing percentages, the default hourly rate, and the list of approved rates.

## Requirements

### Requirement: Starting defaults
Without any Admin change, the defaults SHALL be QA 25%, PM 30%, bug fixing 10%, default rate $30, and approved rates $25, $30, $35, $40, $45 and $50 per hour.

#### Scenario: Fresh installation
- **WHEN** a request is created on a new installation
- **THEN** it starts with QA 25%, PM 30%, bug fixing 10% and a rate of $30

### Requirement: Admins change the defaults
Admins SHALL be able to change the percentages (0–100, whole numbers), the approved rates (whole US dollars, 1–1000, at least one) and the default rate (one of the approved rates) under Settings → Estimate defaults. Changes SHALL apply to requests created afterwards only. Other roles SHALL be refused with 403.

#### Scenario: Change QA default
- **WHEN** an Admin sets the QA default to 20%
- **THEN** requests created afterwards start with QA 20%
- **AND** existing requests keep their QA percentage

#### Scenario: Default rate must be approved
- **WHEN** an Admin removes $30 from the approved rates while it is the default rate
- **THEN** the change is refused with "The default rate must be one of the approved rates"

#### Scenario: Non-Admin
- **WHEN** an Estimator calls the change-defaults action directly
- **THEN** the response is 403 and nothing changes

### Requirement: Removed rates on existing requests
A request whose rate is no longer approved SHALL keep that rate until the estimator changes it, and the pre-export checklist SHALL warn that the rate is no longer an approved rate.

#### Scenario: Rate removed later
- **WHEN** a request uses $25 and an Admin removes $25 from the approved rates
- **THEN** the request still shows $25 and its checklist warns "The rate is no longer an approved rate"

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
