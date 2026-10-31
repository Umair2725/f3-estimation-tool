# Spec Delta

## Purpose

Defines the pre-export checklist and the internal Excel export: a lean copy of Folio3's estimation template (v0.5) filled from an estimation request, with working formulas and nothing from the template's sample content.

## ADDED Requirements

### Requirement: Pre-export checklist
Before exporting, the tool SHALL list warnings, each linking to where it can be fixed: Min greater than Max; Sub tasks with 0 hours; Tasks with no Sub tasks; features with no hours on any part; the rate not confirmed; and text in the request that names another client in the tool. Warnings SHALL NOT block the internal export.

#### Scenario: Warnings shown
- **WHEN** a request has a Sub task with Min 20 and Max 12, and the rate is still unconfirmed
- **THEN** the checklist shows "Min is more than Max" for that Sub task and "Confirm the hourly rate"
- **AND** the export can still be downloaded

#### Scenario: Another client named
- **WHEN** a Sub task comment mentions "Contoso Logistics" on a request for Northwind Clinics, and Contoso Logistics is a client in the tool
- **THEN** the checklist warns that the request names another client

### Requirement: Internal export from the template
Anyone with a role who can view a request SHALL be able to download its internal export as an `.xlsx` file built from `docs/templates/Empty_Estimation_Sheet.xlsx`, keeping the template's styles, column widths and the reference notes block. The file name SHALL be "<project name> – Estimate (internal) – <YYYY-MM-DD>.xlsx", with characters not allowed in file names removed. Exporting SHALL NOT change the request's status.

#### Scenario: Download
- **WHEN** an Estimator exports "Patient portal MVP" on 2026-10-31
- **THEN** a file named "Patient portal MVP – Estimate (internal) – 2026-10-31.xlsx" downloads
- **AND** it opens in Excel without repair prompts or errors

### Requirement: Summary sheet
The Summary sheet SHALL show the project name, client, project manager and date; one Min/Max row per development sheet, named after the sheet and linked to that sheet's grand total by formula; a QA row and a PM row as percentage formulas of the development rows (left out when turned off), with the percentage in Comments; a Total row summing them; and Special Considerations rows 27–34 filled from the request.

#### Scenario: Two parts with QA and PM
- **WHEN** a request has Backend (Node.js) and Mobile (React Native), QA 25% and PM 30%
- **THEN** Summary has rows "Backend (Node.js)" and "Mobile (React Native)" linked to those sheets, a QA row "=25% × development", a PM row "=30% × development", and a Total of all four rows, for both Min and Max

#### Scenario: Special considerations
- **WHEN** a request has application types Web and Mobile, HIPAA and Security with the note "Pen test before launch"
- **THEN** row 27 shows "Web, Mobile" and row 32 shows "Yes" with "Pen test before launch"

### Requirement: Price block
The Summary SHALL include an hourly rate cell and "Cost (Min)" and "Cost (Max)" as formulas multiplying the Total by the rate cell, so changing the rate in Excel updates the cost.

#### Scenario: Change the rate in Excel
- **WHEN** the exported rate is $30 and someone changes the rate cell to $40 in Excel
- **THEN** both cost cells recalculate from the same Total

### Requirement: No resources or timeline
The export SHALL leave the Summary's Resources and Weeks columns empty, with no formulas in them, and SHALL NOT show team size, weeks or dates of delivery anywhere.

#### Scenario: Resources and Weeks blank
- **WHEN** any request is exported
- **THEN** the Resources and Weeks cells in the Summary rows are empty

### Requirement: Development sheets
The export SHALL contain one development sheet per part of the request, named "<Part> (<technologies>)" and shortened to Excel's 31-character limit, copied from the template's development sheet. Each sheet SHALL list the part's Tasks with their Sub tasks, Min, Max and comments, with as many rows as needed; Bug Fixing as a formula of the development total and the request's percentage; Deployment with the request's environments; and the part's Assumptions and Risks.

#### Scenario: More Sub tasks than the template has rows
- **WHEN** a Task has 9 Sub tasks and the template block has 6 rows
- **THEN** all 9 Sub tasks appear, and the Task total covers all 9

### Requirement: Totals are formulas
Every Task total, development total, post-development total, grand total, Summary row and Total SHALL be a formula, for both Min and Max, covering exactly the rows it should. The stored result of each formula SHALL equal the totals shown in the tool.

#### Scenario: Totals match the tool
- **WHEN** the tool shows a grand total of 195.3–275.9 hours
- **THEN** the exported Summary Total shows 195.3 and 275.9, and both cells contain formulas

### Requirement: Lean output
The export SHALL leave out the QA, GD and PM detail sheets, the template's unused development sheets, the Questions sheet, Research Tasks, and the Memory leak, Design & Code Review and Documentation lines, and SHALL contain no placeholder text such as "Task -1" or "<Yes/No>" and no reference to a sheet that isn't in the file.

#### Scenario: Sample content never ships
- **WHEN** any request is exported
- **THEN** the file has no Questions sheet and none of the template's sample questions
- **AND** no formula refers to a missing sheet

### Requirement: Export record
Every export SHALL be recorded with the request, the person, the time, the kind ("internal") and the file name, and the request page SHALL show the latest export.

#### Scenario: Last export shown
- **WHEN** Sara exports a request
- **THEN** the request page shows "Last exported by Sara" with the time
