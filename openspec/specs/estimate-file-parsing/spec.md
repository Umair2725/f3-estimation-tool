# estimate-file-parsing Specification

## Purpose

Defines how an estimate workbook in Folio3's template, or one of its real-world variations, is read into structured Tasks, Sub tasks and hours with their sources, what is skipped, and which problems are reported as warnings.

## Requirements

### Requirement: Classify sheets by name
Every sheet SHALL be classified from its name, case-insensitively, as Backend (`backend`, `server`, `node`, `api`), Web/Frontend (`web`, `react`, `ui`, `frontend`), Admin Panel (`admin`), Mobile (`mobile`, `app`, `flutter`, `react native`, `ios`, `android`), Cloud/Infrastructure (`cloud`, `infra`, `devops`), QA, GD, PM, Questions, Summary, or Unknown. When several match, the most specific SHALL win (Admin over Web, GD over Web or Mobile). Unknown sheets SHALL be reported with a warning.

#### Scenario: Renamed sheets
- **WHEN** a file has sheets "BackEnd", "React Web", "MobileApp", "Admin Panel", "GD Estimates (Web)" and "MVP"
- **THEN** they are classified as Backend, Web/Frontend, Mobile, Admin Panel, GD and Unknown
- **AND** a warning says the kind of "MVP" is unknown

### Requirement: Find the table by its header
On each development sheet, the parser SHALL find the header row containing "S.No", "Task", "Minimum" and "Maximum" (and "Comments" when present) anywhere in the first 30 rows and SHALL locate the columns from it. A sheet without such a header SHALL be reported and skipped.

#### Scenario: Header on row 10
- **WHEN** a sheet's header is on row 10 with the columns shifted one to the right
- **THEN** its Tasks and Sub tasks are read from the right columns

### Requirement: Read Tasks and Sub tasks with sources
A row with a number in S.No and text in Task SHALL start a Task; following rows with text in Task and no S.No SHALL be its Sub tasks with Min, Max and Comments, until the next Task or section label. Every Task and Sub task SHALL keep its sheet name and row number. Hours SHALL be read from values or, for formulas, from their saved results.

#### Scenario: Source kept
- **WHEN** the Sub task "Login API" is on row 19 of "Dev Backend Estimates"
- **THEN** the parsed Sub task has sheet "Dev Backend Estimates" and row 19

#### Scenario: Formula without a saved result
- **WHEN** a Sub task's Max cell is a formula with no saved result
- **THEN** its Max is treated as unknown (0) and a warning names the cell

### Requirement: Recalculate totals and compare
The parser SHALL compute each Task's and each sheet's development hours from its Sub tasks, and SHALL compare them with the file's own Task and development totals when present; a difference larger than 0.05 hours SHALL produce a warning stating both numbers.

#### Scenario: Missing Task formulas
- **WHEN** a sheet's Task rows have no SUM formulas and its development total shows 26–34 while its Sub tasks add up to 166–254
- **THEN** the parsed development hours are 166–254
- **AND** a warning says the file shows 26–34 but the Sub tasks add up to 166–254

### Requirement: Read sections by label
The parser SHALL find, by label, the development total, Other Development Activities, Research Tasks, Assumptions & Constraints, Risks and Notes. Deployment and other activities with hours SHALL be returned as rows; Research Tasks with real content SHALL be returned as Tasks marked as research; Assumptions and Risks SHALL be returned as text lists; the Notes block SHALL be skipped.

#### Scenario: Assumptions and research
- **WHEN** a sheet lists two assumptions and one research task with 8–12 hours
- **THEN** the parsed sheet has those two assumptions and one research Task of 8–12 hours

### Requirement: Bug fixing as a percentage
Bug fixing SHALL be returned as a percentage of development, read from its formula (such as `D31*0.25` or `D31*25%`) or, without a formula, computed from its Min hours divided by the development Min hours.

#### Scenario: Bug fixing as a percentage
- **WHEN** the Bug Fixing row's Min is the formula `D31*0.25`
- **THEN** the sheet's bug fixing is 25%

### Requirement: Skip placeholders and report skeleton sheets
The parser SHALL skip template placeholders ("Task -N", "Sub task -N", text in angle brackets such as "<Research Task …1>" or "<List down …>"), rows that have neither text nor hours, and the template's sample Questions and Assumptions. A development sheet with numbered rows but no Task text or hours SHALL be reported as a skeleton with no data.

#### Scenario: Unfilled template
- **WHEN** an unfilled copy of the template is parsed
- **THEN** no Tasks or Sub tasks are returned
- **AND** every development sheet is reported as having no data

### Requirement: Read header details
For each development sheet, the parser SHALL return the title text, the stack written in brackets in the title or sheet name (for example "Node" from "Portal (Node)"), the date as written (and as a calendar date when it can be read), and the names after "By" and "Reviewed by".

#### Scenario: Stack and reviewer
- **WHEN** a sheet's title is "Patient Portal (React Native)" and a header cell reads "By: Ali / Reviewed by: Sara"
- **THEN** the stack is "React Native", the estimator is "Ali" and the reviewer is "Sara"

### Requirement: Read the Summary
The parser SHALL return, from the Summary sheet by label, the project name, client, project manager and date, the Special Considerations (label, action and comments), the QA and PM percentages of development (from formulas or computed from values), and the template version from its title. Text that looks like a separate table of hours outside the summary rows SHALL produce a "free-form table" warning.

#### Scenario: QA as a percentage
- **WHEN** the Summary's QA row is the formula `C11*0.3`
- **THEN** the QA percentage is 30

#### Scenario: Different template version
- **WHEN** the Summary title says "Folio3 Project Estimation Template v 0.4"
- **THEN** a warning says the file uses template v0.4, not v0.5

### Requirement: Warnings, not failures
Data problems SHALL become warnings that name the sheet and cell: Min greater than Max, duplicate S.No on a sheet, text typed outside the table (for example in column A), and the problems above. Only a file that cannot be opened as a workbook SHALL fail, with the reason "This file isn't a readable Excel workbook".

#### Scenario: Min greater than Max
- **WHEN** a Deployment row has Min 8 and Max 0
- **THEN** the row is returned as it is
- **AND** a warning names the sheet and row

#### Scenario: Not a workbook
- **WHEN** a PDF renamed to `.xlsx` is parsed
- **THEN** the result is an error "This file isn't a readable Excel workbook" and nothing is thrown to the caller

### Requirement: Content fingerprint
Every parse result SHALL include the SHA-256 hash of the file's bytes, so identical files can be recognised regardless of their names.

#### Scenario: Same content, different names
- **WHEN** the same file is parsed under two different names
- **THEN** both results have the same fingerprint

### Requirement: Round trip of the tool's own export
A file produced by the tool's internal export SHALL parse back to the same parts, Tasks, Sub tasks, Min and Max hours, comments, bug-fixing percentage, Deployment hours, Assumptions, Risks, and QA and PM percentages, with no warnings.

#### Scenario: Export then parse
- **WHEN** a request with two parts is exported and the file is parsed
- **THEN** the parsed data equals the request's estimate and there are no warnings

### Requirement: Local check from the command line
A command `npm run parse-estimate -- <file>` SHALL print, without uploading or storing anything, the file's sheets and their kinds, each part's Task and Sub task counts and hours, the Summary details, and every warning.

#### Scenario: Check a local file
- **WHEN** someone runs the command on a file in `samples/`
- **THEN** the summary and warnings are printed and the exit code is 0
