# Spec Delta

## Purpose

Defines how hours are entered for an estimation request: Tasks and Sub tasks with Min and Max hours per part, per-part extras, the request's overheads and rate, and the totals shown live.

## ADDED Requirements

### Requirement: Tasks follow features and parts
Each feature of a request SHALL appear as one Task on every part it belongs to, named after the feature, in the request's feature order. Tasks SHALL follow the features: adding, renaming, reordering or removing a feature, or removing one of its parts, updates the Tasks, and removing a Task's feature or part removes its Sub tasks.

#### Scenario: Feature on two parts
- **WHEN** the feature "Appointment booking" belongs to Backend and Mobile
- **THEN** the estimate shows a Task "Appointment booking" on both the Backend and the Mobile tab

#### Scenario: Part removed from a feature
- **WHEN** Mobile is removed from "Appointment booking" in the wizard
- **THEN** the Mobile Task "Appointment booking" and its Sub tasks are gone

### Requirement: Sub tasks with Min and Max hours
On the estimate page, a person who may edit the request SHALL be able to add, edit, reorder and remove Sub tasks under each Task, each with a title (required), Min hours, Max hours and an optional comment. Hours SHALL be numbers from 0 to 9,999 with at most one decimal place.

#### Scenario: Add a Sub task
- **WHEN** an Estimator adds the Sub task "Booking API" with Min 12 and Max 16 under Backend → "Appointment booking" and saves
- **THEN** the Task shows that Sub task and a Task total of 12–16 hours

#### Scenario: Invalid hours
- **WHEN** someone enters -3 or 2.25 as hours
- **THEN** the value is refused with "Enter hours from 0 to 9999, with at most one decimal"

### Requirement: Part extras
Each part SHALL have optional Deployment Min and Max hours, a list of Assumptions and a list of Risks. When the request includes staging, production or app store publishing, the Deployment line SHALL name them.

#### Scenario: Deployment from the environment
- **WHEN** a request includes Staging, Production and Google Play, and Backend has Deployment 16–24
- **THEN** the Backend tab shows Deployment 16–24 with "Staging, Production, Google Play"

### Requirement: Overheads and rate per request
Each request SHALL have a QA percentage and a PM percentage, each of which can be turned off, a bug-fixing percentage, and an hourly rate chosen from the approved rates, with a "rate confirmed" flag. New requests SHALL start from the current estimate defaults, and later changes to the defaults SHALL NOT change existing requests.

#### Scenario: Defaults applied
- **WHEN** a request is created while the defaults are QA 25%, PM 30%, bug fixing 10% and rate $30
- **THEN** the request has those values and its rate is not confirmed

#### Scenario: Turn off PM
- **WHEN** the estimator turns PM off for a request
- **THEN** the totals and the export have no PM row

#### Scenario: Rate outside the approved list
- **WHEN** someone saves a rate of $33 while it is not an approved rate
- **THEN** it is refused with "Choose one of the approved rates"

### Requirement: Totals
The estimate page SHALL show, for Min and Max separately: each Task total (the sum of its Sub tasks), each part's development total, its bug fixing (bug-fixing % of the development total) and its Deployment hours; the overall development total (all parts, including bug fixing and Deployment); QA and PM (their % of the overall development total); the grand total; and cost (grand total × rate). Totals SHALL update as hours are typed, before saving.

#### Scenario: Totals for one part
- **WHEN** Backend has Sub tasks totalling 100–140 hours, bug fixing is 10%, Deployment is 16–24, QA is 25% and PM is 30%, and the rate is $30
- **THEN** development is 126–178, QA is 31.5–44.5, PM is 37.8–53.4, the total is 195.3–275.9 hours, and cost is $5,859–$8,277

### Requirement: Who may change hours
Everyone with a role SHALL be able to view the estimate page. Only people who may edit the request (its owner or an Admin, while it is a Draft or Changes requested) SHALL be able to change hours, extras, overheads or the rate, checked on the server.

#### Scenario: View only
- **WHEN** a Tech Lead opens another person's estimate page
- **THEN** they see all hours and totals, and no field can be changed
- **AND** a direct call to save hours responds 403

### Requirement: Hours on the home list
The home list's hours column SHALL show each request's grand total as "Min–Max" (rounded to whole hours) once the request has any Sub task hours, and "–" otherwise. The request page SHALL show the same total and link to the estimate page.

#### Scenario: Request with hours
- **WHEN** a request's grand total is 195.3–275.9 hours
- **THEN** its home row shows "195–276"
