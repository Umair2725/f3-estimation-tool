# historical-import Specification

## Purpose

Defines how Admins load Folio3's past estimates, with their actual hours where projects were delivered, into the tool as historical projects: upload, preview and corrections, duplicate handling, approval with sources kept, and the batch summary.

## Requirements

### Requirement: Admins import in batches
Only Admins SHALL be able to import past projects, under Settings → Import past projects; other roles SHALL be refused with 403, checked on the server. Each upload SHALL create an import batch recording who uploaded it and when.

#### Scenario: Non-Admin
- **WHEN** a Tech Lead calls the import upload directly
- **THEN** the response is 403 and no batch is created

### Requirement: Single project or zip upload
An Admin SHALL be able to upload either one estimate `.xlsx` with an optional actuals `.xlsx`, or one `.zip` with one folder per project holding an estimate and optionally an actuals file. Limits: `.xlsx` 10 MB each, `.zip` 100 MB, 150 projects per batch.

#### Scenario: Single project
- **WHEN** an Admin uploads one estimate and one actuals file
- **THEN** the batch has one project with both files

#### Scenario: Too many projects
- **WHEN** a zip holds 151 project folders
- **THEN** the upload is refused with "A batch can hold at most 150 projects"

### Requirement: Grouping files in a zip
In a zip, each top-level folder SHALL be one project; a file whose name ends with `-actuals.xlsx`, `_actuals.xlsx` or ` actuals.xlsx` (any case) SHALL be its actuals file and the other `.xlsx` its estimate. Files in the zip root SHALL each be an estimate-only project. Other files SHALL be ignored and listed in the batch notes.

#### Scenario: Zip with two projects
- **WHEN** an Admin uploads a zip with folders "Portal" (estimate.xlsx, estimate-actuals.xlsx) and "Fleet" (fleet.xlsx)
- **THEN** the batch has two projects: "Portal" with estimate and actuals, and "Fleet" with an estimate only

### Requirement: Files identified by content
Every uploaded file SHALL be stored with its original name, a SHA-256 fingerprint, its kind (estimate or actuals), who uploaded it and when; files SHALL never be identified by name.

#### Scenario: Same name, different projects
- **WHEN** two projects both contain a file named "Estimation_Sheet.xlsx" with different content
- **THEN** both are imported as separate projects with no duplicate warning

### Requirement: A failed file doesn't stop the batch
A file that cannot be read SHALL mark only its project as failed, with the parser's reason, and the rest of the batch SHALL continue.

#### Scenario: One unreadable file
- **WHEN** a batch of five projects contains one PDF renamed to `.xlsx`
- **THEN** four projects are ready for preview and one is failed with "This file isn't a readable Excel workbook"

### Requirement: Preview before approval
Each project in a batch SHALL have a preview showing the Summary details (project, client, project manager, date), each sheet with its detected part, the Tasks and Sub tasks with Min, Max and source sheet and row, the parser's warnings, and who uploaded it and when. For a project with an actuals file, the preview SHALL show the estimate-vs-actual comparison with each row Matched, Unplanned or Dropped. Nothing from a batch SHALL become a historical project until it is approved.

#### Scenario: Preview of a delivered project
- **WHEN** an Admin opens a project with an estimate and an actuals file
- **THEN** they see its Tasks and Sub tasks with sources, the warnings, and the matched, unplanned and dropped rows

### Requirement: Corrections on the preview
On the preview the Admin SHALL be able to change a sheet's part or skip it, rename or exclude Task and Sub task rows, swap which file is the estimate and which the actuals, and change the project name and client. Corrections SHALL be kept with the batch until the project is approved or rejected.

#### Scenario: Assign an unknown sheet
- **WHEN** a sheet "MVP" is detected as Unknown and the Admin assigns it to Web/Frontend
- **THEN** its Tasks are imported as Web/Frontend

#### Scenario: Exclude a row
- **WHEN** the Admin excludes the Sub task "Sample row" and approves
- **THEN** the historical project has no "Sample row"

### Requirement: Same file already imported
A project whose estimate file has the same fingerprint as a file of an already approved import SHALL be marked "Already imported" with the choices Skip or Keep both, and SHALL NOT be approved until one is chosen.

#### Scenario: Same file twice
- **WHEN** an Admin imports a file that was already imported in an earlier batch
- **THEN** the project is marked "Already imported" and nothing is created unless they choose Keep both

### Requirement: Possibly a newer version
A project with the same project name and client (ignoring case and spacing) as an existing historical project but different content SHALL be marked "Possibly a newer version of <project>" with the choices Link as new version, Treat as a different project, or Skip, and SHALL NOT be approved until one is chosen.

#### Scenario: Newer version
- **WHEN** a file for "Patient portal MVP" / "Northwind Clinics" differs from the already imported one
- **THEN** the project is marked "Possibly a newer version of Patient portal MVP"

### Requirement: Approval creates a historical project
Approving a project SHALL create an estimation request with origin Imported, status Approved, its hours marked as the pre-AI baseline, the project details from the file (after corrections), one part per assigned sheet with its Tasks and Sub tasks, and the file's bug-fixing, QA and PM percentages when present. Rejecting or skipping SHALL create nothing.

#### Scenario: Approve an estimate-only project
- **WHEN** an Admin approves a project with only an estimate file
- **THEN** a historical request exists with status Approved, origin Imported and its Sub tasks and hours, and no outcome

### Requirement: Delivered projects keep their actual hours
Approving a project that has an actuals file SHALL set its outcome to Delivered and save its actual hours, matched with the actual-hours matching, as actual-hours version 1; rows matched by similar names SHALL be flagged "matched by similarity at import". The original estimate and actuals files SHALL stay downloadable from the historical project.

#### Scenario: Approve a delivered project
- **WHEN** an Admin approves a project with an estimate and an actuals file
- **THEN** a historical request exists with status Approved, outcome Delivered, its Sub tasks and hours, and actual-hours version 1

#### Scenario: Reject
- **WHEN** an Admin rejects a project
- **THEN** no request is created and the batch shows it as rejected

### Requirement: Sources kept on every Sub task
Every Sub task of a historical project SHALL keep its source file, sheet name and row number, and the request page SHALL show them, for example "Dev Backend Estimates, row 19".

#### Scenario: Source shown
- **WHEN** someone opens an imported project's estimate
- **THEN** each Sub task shows the sheet and row it came from

### Requirement: Batch summary
Each batch SHALL show a summary with the number of projects imported, skipped, rejected, failed and still waiting, and each project's reason when it was skipped or failed.

#### Scenario: Summary at the end
- **WHEN** a batch of 100 projects has 95 approved, 3 skipped as duplicates and 2 failed
- **THEN** the summary shows 95 imported, 3 skipped and 2 failed, with the reasons

### Requirement: Historical projects in the app
Imported projects SHALL appear on Home and their request page with an "Imported" label and SHALL be read-only like other approved requests; their estimate and actual hours SHALL be viewable by everyone with a role.

#### Scenario: Imported label
- **WHEN** a historical project is approved
- **THEN** its home row shows "Imported" next to its status
