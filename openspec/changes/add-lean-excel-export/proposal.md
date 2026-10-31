# Proposal

## Why

Estimation requests now record scope (parts, technologies, features), but there are no hours and nothing to send. The team's deliverable is Folio3's Excel template. The brief builds the export early (section 12, step 4; F-07) so the output format is fixed before the AI work, and the AI suggestions later fill the same hours. Hours are entered by hand for now, so the tool produces a usable estimate today (product owner decision, 2026-10-31).

## What Changes

- **Estimate hours** (a first version of design screen 4, without AI):
  - On each request, every feature becomes a **Task** on each part it belongs to (the template's development sheets).
  - Each Task gets **Sub tasks** with Min and Max hours and a comment.
  - Each part can also have Deployment hours, Assumptions and Risks.
  - Live totals: development, bug fixing %, QA %, PM %, total, and cost at the chosen rate.
- **Overheads and price per request:**
  - QA % (default 25, can be turned off), PM % (default 30, can be turned off) and bug fixing % (default 10)
  - the hourly rate, picked from the approved rates (default $30), and a "rate confirmed" flag
  - defaults come from Admin settings
- **Settings → Estimate defaults** (Admin): the QA, PM and bug-fixing defaults, the default rate and the approved-rate list ($25, $30, $35, $40, $45, $50). Changes apply to new requests only.
- **Pre-export checklist** of warnings, which don't block the export:
  - Min > Max
  - Sub tasks with 0 hours
  - Tasks with no Sub tasks
  - features with no hours
  - the default rate not confirmed
  - text naming a different client from the tool
- **Internal Excel export** from Folio3's template (`docs/templates/Empty_Estimation_Sheet.xlsx`, v0.5), keeping its layout and styles:
  - **Summary:**
    - project details (B2, C5–C7)
    - **one Min/Max row per development sheet**, linked by formulas
    - **QA** and **PM** rows as percentage formulas (left out when turned off), and a Total
    - a **price block**: rate cell, Cost Min and Cost Max as formulas
    - **Resources and Weeks left blank**, with their formulas removed
    - Special Considerations rows 27–34 from the request
  - **One development sheet per part,** named after the part and stack, for example "Backend (Node.js)":
    - rows inserted for the real Tasks and Sub tasks
    - **Task totals and sheet totals always as working formulas,** for Min and Max (the template's Max totals are hard-coded 0)
    - bug fixing as a % formula, Deployment from the request, Assumptions and Risks
  - **Left out:** the QA, GD and PM detail sheets, the unused development sheets, and the **Questions sheet, which carries sample content from another project**. No broken references remain.
  - The download is named "<Project> – Estimate (internal) – <date>.xlsx". Each export is recorded: who, when, file name.
- **Home list:** the hours column shows each request's total Min–Max once it has hours.

**Out of scope:**
- the **client-facing export**: it needs Approved estimates (F-10) and will be added with the review workflow
- AI suggestions and source references (F-04, F-05, F-24)
- team experience
- Research Tasks and the other optional template blocks (QA, GD, PM detail sheets, memory leaks, code review, documentation lines)
- client questions (F-13)
- versions (F-11)

## Capabilities

### New Capabilities
- `estimate-hours`: entering Tasks, Sub tasks and Min/Max hours per part, per-part deployment hours, assumptions and risks, request overheads (QA, PM, bug fixing) and rate, live totals, and who may change them.
- `excel-export`: the pre-export checklist and the internal Excel export built from Folio3's template, including formulas, sheet naming, left-out blocks and export records.
- `estimate-defaults`: Admin-managed defaults for QA, PM and bug-fixing percentages, the default hourly rate and the approved rates.

### Modified Capabilities
- None. The home list's hours column already shows "–" until a request has hours (`home-screen`, not yet archived); this change supplies the hours it shows.

## Impact

- **Code:**
  - the estimate page (`/estimates/[id]/estimate`) and an export route (`/estimates/[id]/export`)
  - Settings → Estimate defaults
  - services for hours, totals, checklist and export, with server-side permission checks
  - a workbook builder that loads the template
- **Database:** new tables for tasks, sub tasks, per-part extras (deployment hours, assumptions, risks), request overhead and rate fields, estimate defaults, and export records (Prisma migration). Existing requests get the defaults.
- **Dependencies:** `exceljs` (exact version), for reading the template and writing the workbook.
- **Template:** `docs/templates/Empty_Estimation_Sheet.xlsx` is read at runtime and copied into the container image.
- **Order:** this change only adds capabilities, so it can be archived independently of the two unarchived changes.
