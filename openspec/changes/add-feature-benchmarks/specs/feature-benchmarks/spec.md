# Spec Delta

## Purpose

Defines the AI-era feature benchmark library: the hours Folio3's developers actually spend with AI on common features, kept per part and stack, imported from the seed list or survey, confirmed by a Tech Lead or Architect, and kept current from observations, with changes over a threshold proposed to an Architect and every change logged.

## ADDED Requirements

### Requirement: Benchmark library
The tool SHALL keep one benchmark per feature, per part and optionally per stack, with an ID (`FB-` and a number, unique), part (Web/Frontend, Backend, Admin Panel, Mobile, Cloud/Infrastructure, Design or Any) and typical stack ("Any" when not specific). Everyone with a role SHALL be able to view and search the library under Knowledge base → Feature hours.

#### Scenario: Browse
- **WHEN** an Estimator opens Feature hours and searches "sign up" with part Web/Frontend
- **THEN** matching benchmarks are listed with their ID, feature, part and stack, pre-AI and AI-era hours, status and last update

### Requirement: What a benchmark records
Each benchmark SHALL record its module, feature name, what one instance includes, pre-AI Min and Max with their source, AI-era hours for an experienced developer and for a junior developer, AI tools used, the number of projects it is based on, status (Draft, Confirmed or Retired), who confirmed it and when, and notes.

#### Scenario: Benchmark page
- **WHEN** someone opens FB-012
- **THEN** every field above is shown, with "Draft" or "Confirmed by <name> on <date>"

### Requirement: AI-era hours map to Min and Max
A benchmark's experienced-developer hours SHALL be used as Min and its junior-developer hours as Max. Pre-AI hours SHALL be shown for comparison only and never used as a benchmark's suggestion. A benchmark is usable for suggestions only when it has experienced-developer hours and is not Retired; when junior hours are missing, Max SHALL equal Min.

#### Scenario: Only pre-AI hours
- **WHEN** a benchmark has pre-AI hours 10–12 and no AI-era hours
- **THEN** it is never offered as a suggestion

### Requirement: Import from the seed list or the survey
Admins SHALL be able to import the seed CSV or the survey workbook (its Features sheet), with the documented columns. The import SHALL show a preview of new, changed and unchanged rows and problems per row (unknown part, Min above Max, a non-numeric value) before anything is saved, match rows by ID, add new IDs, and update existing ones. Other roles SHALL be refused with 403.

#### Scenario: Seed import
- **WHEN** an Admin imports `data/feature-benchmarks.csv` into an empty library and applies it
- **THEN** 166 Draft benchmarks exist, none with AI-era hours

#### Scenario: Survey with hours
- **WHEN** the survey row FB-012 has experienced 4 and junior 6, confirmed by "Ahmed"
- **THEN** after applying, FB-012 is Draft with 4–6 h, two Survey observations, and the note "Confirmed in survey by Ahmed"

#### Scenario: Bad row
- **WHEN** a row has the part "Frontendz"
- **THEN** the preview lists "Row 14: unknown part Frontendz" and that row is not applied

### Requirement: Imported hours are observations
AI-era hours in an imported row SHALL be recorded as observations (source "Survey", dated by the row's date or the import date) and the benchmark recalculated from them. A "Confirmed by" name in the file SHALL be kept as a note and SHALL NOT confirm the benchmark.

#### Scenario: Confirmed by in the file
- **WHEN** a row says "Confirmed by: Ahmed"
- **THEN** the benchmark stays Draft with the note "Confirmed in survey by Ahmed"

### Requirement: Edit, confirm and retire
Tech Leads, Architects and Admins SHALL be able to add and edit benchmarks; only Tech Leads and Architects SHALL be able to confirm one; Architects and Admins SHALL be able to retire one. Changing the AI-era hours of a Confirmed benchmark by hand SHALL return it to Draft. A Retired benchmark SHALL NOT be suggested.

#### Scenario: Estimator cannot confirm
- **WHEN** an Estimator calls confirm on a benchmark
- **THEN** the response is 403

#### Scenario: Edit after confirmation
- **WHEN** a Tech Lead changes a Confirmed benchmark's experienced hours from 4 to 5
- **THEN** it is Draft again and the change log shows the edit

### Requirement: Observations
Tech Leads and Architects SHALL be able to add an observation to a benchmark: hours, developer level (experienced, junior or mixed), date, AI tools used, an optional project and a note. Each observation SHALL record who entered it and its source (manual, survey or actual hours). Mixed observations SHALL be recorded but not used to recalculate.

#### Scenario: Manual observation
- **WHEN** a Tech Lead records "Sign up form, experienced, 3.5 h, Claude Code"
- **THEN** the observation is listed on the benchmark with their name and the date

### Requirement: Recalculation
After an observation is added, a benchmark's experienced and junior hours SHALL each be recalculated as the weighted mean of that level's observations, where observations from the last 6 months weigh twice as much as older ones, rounded to the nearest 0.5 h. A level with no observations SHALL keep its current hours. "Based on N projects" SHALL be updated to the number of distinct projects among its observations (manual and survey observations without a project count as one each).

#### Scenario: Weighted mean
- **WHEN** a benchmark has experienced observations of 6 h (two years old) and 4 h (last month)
- **THEN** its experienced hours become 4.5 h ((6×1 + 4×2) ÷ 3 = 4.67, rounded to 4.5)

### Requirement: Large changes are proposed
When a recalculation would change a Confirmed benchmark's experienced or junior hours by more than 15%, the change SHALL be proposed to Architects instead of applied, and the benchmark SHALL show the pending proposal. An Architect SHALL be able to accept it (applied, still Confirmed) or reject it (hours unchanged). Changes within 15%, and any change to a Draft, SHALL apply directly. Pending proposals SHALL be listed on the Reviews page for Architects and counted in the sidebar.

#### Scenario: Over the threshold
- **WHEN** new observations would move Confirmed FB-012 from 4 h to 3 h (-25%)
- **THEN** FB-012 stays at 4 h with "Proposed: 3 h", and Architects see the proposal on the Reviews page

#### Scenario: Within the threshold
- **WHEN** new observations would move it from 4 h to 3.5 h (-12.5%)
- **THEN** it becomes 3.5 h at once and stays Confirmed

### Requirement: Change log and trend
Every change to a benchmark's AI-era hours SHALL be logged with the old and new values, its cause (import, edit, recalculation, accepted or rejected proposal), who or what made it, when, and the observations it was based on. Each benchmark SHALL show a trend of its pre-AI estimate and its AI-era hours over time.

#### Scenario: Trace a change
- **WHEN** someone opens FB-012 after a recalculation
- **THEN** the log shows "Recalculated 4 → 3.5 h from 3 observations" with the date, and the trend lists 10–12 h (pre-AI), then each AI-era value with its date
