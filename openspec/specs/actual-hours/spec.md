# actual-hours Specification

## Purpose

Defines how the hours really spent on a won project are recorded, in the tool or by uploading the estimate's Excel filled with real hours, how those hours are matched to the estimate, kept as versions, and compared in an accuracy report.

## Requirements

### Requirement: Who records actual hours
Tech Leads, Architects and Admins SHALL be able to record actual hours on requests that are In delivery, and Admins also on Delivered requests; everyone with a role SHALL be able to view them. These rules SHALL be checked on the server.

#### Scenario: Estimator views only
- **WHEN** an Estimator opens the actual hours of a request in delivery
- **THEN** they see the hours read-only
- **AND** a direct call to save actual hours responds 403

#### Scenario: Request not won
- **WHEN** someone tries to record actual hours on a request whose outcome is none or Lost
- **THEN** it is refused with "Mark the project as won first"

### Requirement: Record hours in the tool
The actual hours page SHALL list every Sub task of the estimate by part and Task with its estimated Min–Max and an "Actual hours" field (0–9999, one decimal, or empty for not built yet), and SHALL let the person add unplanned rows to a part and Task. Saving SHALL create a new version.

#### Scenario: Enter actual hours
- **WHEN** a Tech Lead enters 38 for the Sub task "Booking API" estimated at 40–56 and saves
- **THEN** a new version exists with "Booking API" matched at 38 hours and a variance of -5% against Min

### Requirement: Upload an actuals file
On a request in delivery, a person who may record actual hours SHALL be able to upload an `.xlsx` file of up to 10 MB in Folio3's estimate template; it SHALL be read with the estimate file parser, and an unreadable file SHALL be refused with the parser's message and nothing stored.

#### Scenario: Not a workbook
- **WHEN** someone uploads a PDF renamed to `.xlsx`
- **THEN** the upload is refused with "This file isn't a readable Excel workbook"

### Requirement: Which number is the actual
For each row in an uploaded file, the actual hours SHALL be the value of a column headed "Actual" when the sheet has one; otherwise Minimum when Minimum and Maximum are equal; otherwise Minimum, with the row flagged "Min and Max differ; Min was used".

#### Scenario: Min and Max differ
- **WHEN** a row has Minimum 10 and Maximum 14 and no Actual column
- **THEN** its actual hours are 10 and the preview flags the row

### Requirement: Match file rows to the estimate
Each sheet of the file SHALL be matched to an estimate part by the parser's sheet kind (unknown sheets are assigned by the person on the preview). Within a part, Tasks and Sub tasks SHALL be matched by name ignoring case, spacing and punctuation; names that are not equal but similar (similarity of at least 0.6) SHALL be proposed as matches that need confirmation. Every row SHALL end up Matched, Unplanned (only in the file) or Dropped (only in the estimate).

#### Scenario: Renamed Sub task
- **WHEN** the estimate has "User login" and the file has "User Login + OTP"
- **THEN** the preview proposes the match and asks for confirmation

#### Scenario: Unplanned and dropped work
- **WHEN** the file adds "Data migration" under a Task and omits the estimated "Image uploader"
- **THEN** "Data migration" is Unplanned and "Image uploader" is Dropped

### Requirement: Preview before saving
After an upload, the person SHALL see a preview of every row with its status, estimated Min–Max, actual hours, variance and flags, plus the parser's warnings; they SHALL be able to confirm or reject proposed matches, change a row's hours, assign unknown sheets, and then save. Nothing SHALL be stored until they save; leaving the preview discards it.

#### Scenario: Reject a proposed match
- **WHEN** the person rejects the proposed match of "User Login + OTP" with "User login"
- **THEN** "User Login + OTP" becomes Unplanned and "User login" becomes Dropped in the saved version

### Requirement: Versions
Every save, from the tool or from a confirmed upload, SHALL create a new version recording who, when, the source (manual or file name) and, for files, the original file and its fingerprint. The latest version SHALL be the request's actual hours; earlier versions SHALL stay viewable, and an uploaded file SHALL be downloadable from its version.

#### Scenario: Re-upload
- **WHEN** a corrected actuals file is uploaded and saved
- **THEN** it becomes the latest version and the previous version is listed in the history

### Requirement: Accuracy report
Each request with actual hours SHALL show an accuracy report: for every part, Task and Sub task, the estimated Min–Max, the actual hours and the variance against Min ((actual − Min) ÷ Min, as a percentage, "–" when Min is 0); totals per part and overall for matched work; and the totals of unplanned and dropped work. The report SHALL be marked "Final" when the request is Delivered and "In progress" otherwise.

#### Scenario: Variance
- **WHEN** a Task was estimated at 40–56 hours and its actual hours are 46
- **THEN** the report shows 40–56, 46 and +15%

### Requirement: Actual hours shown with the estimate
Wherever the request's total estimated hours are shown (home list and request page), the latest actual total SHALL be shown next to it once actual hours exist, for example "195–276 · actual 230".

#### Scenario: Home row with actuals
- **WHEN** a request estimated at 195–276 hours has 230 actual hours
- **THEN** its home row shows "195–276 · actual 230"

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
