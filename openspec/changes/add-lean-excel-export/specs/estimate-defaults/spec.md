# Spec Delta

## Purpose

Defines the Admin-managed defaults every new estimate starts from: QA, PM and bug-fixing percentages, the default hourly rate, and the list of approved rates.

## ADDED Requirements

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
