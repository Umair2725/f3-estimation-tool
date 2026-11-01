# Proposal

## Why

Estimates are only guesses until they are compared with the hours really spent. Comparing them:
- is the only way to check the AI reduction factors (F-05)
- teaches the feature benchmarks (F-24)
- lets matching rank sources with real hours first (F-04)

Folio3 tracks time in different tools, so the brief (F-12) has people record actual hours in the tool or by **uploading the same Excel estimate filled with the real hours**. This is step 6 in the brief's order. It builds on the new estimate file parser, and the historical import (F-08) will reuse its matching.

## What Changes

- **Project outcome** on every request: none, **Won → In delivery**, **Lost** (with an optional reason) and **Delivered**.
  - The owner, Tech Leads, Architects and Admins can set it.
  - **Delivered locks the actual hours.** After that only an Admin can change them, and an Admin can also reopen the project.
  - Home and the request page show the outcome.
- **Actual hours in the tool:** on a Won or In-delivery request, an **"Actual hours" column** next to each Sub task of the estimate.
  - It's editable by Tech Leads, Architects and Admins (the brief: Architects and Tech Leads record actuals).
  - Saving creates a new **version**.
- **Actuals upload:** upload the request's exported Excel with the hours replaced by real hours, unplanned rows added, and unbuilt rows removed.
  - The file is read with the estimate file parser.
  - Rows are matched by **part → Task → Sub task name**, exactly or by similarity (similar names are shown for confirmation). Each row is **Matched**, **Unplanned** (only in the file) or **Dropped** (only in the estimate).
  - **Which number counts:** an "Actual" column, if there is one; otherwise Min and Max should be equal. If they differ, Min is used and the row is flagged.
  - On a **preview** the person can see each row's status and variance, confirm or change similar-name matches, fix hours, assign unknown sheets to a part, and then **Save as a new version**.
  - Nothing is stored until they confirm. The original file is kept with the version.
- **Versions:**
  - every save or confirmed upload is a version (who, when, source: manual or file)
  - the latest version counts, and earlier ones can be viewed
- **Accuracy report** per request:
  - estimated Min–Max vs actual hours by part, Task and Sub task
  - the variance % against Min
  - unplanned and dropped work totals
  - it is labelled "Final" once the project is Delivered

**Out of scope:**
- the calibration report across projects (Release 1.1)
- feature benchmarks and single-feature actuals (F-24)
- match references showing actual hours (F-04)
- bulk import of delivered projects (F-08, which reuses this matching)
- requiring the estimate to be Approved first: approval (F-10) doesn't exist yet, so any request with an estimate can be marked Won until then

## Capabilities

### New Capabilities
- `project-outcome`: the Won, Lost, In delivery and Delivered outcome of a request, who sets it, and the lock on Delivered projects.
- `actual-hours`: recording actual hours in the tool or by Excel upload, matching file rows to the estimate, the preview, versions, and the per-request accuracy report.

### Modified Capabilities
- None. The pages this touches (Home, the request page) belong to `estimation-requests` and `home-screen`, which aren't archived yet, so the new outcome and actuals displays are specified in the new capabilities.

## Impact

- **Code:**
  - outcome controls on the request page and an outcome column on Home
  - an "Actual hours" page (`/estimates/[id]/actuals`) with the in-tool editor, the upload and preview, version history, and the accuracy report
  - a matching service built on `src/server/estimate-parser`
  - server actions, with permission checks
- **Database:** an outcome enum and fields on the request; `ActualsVersion` (source, file bytes and name, fingerprint, who and when) and `ActualHours` rows (link to a Sub task, or an unplanned row with its part and Task, hours, status, similarity, flags). Prisma migration.
- **Permissions:** a new `actuals.record` permission (Tech Lead, Architect, Admin) and `outcome.set` (owner, Tech Lead, Architect, Admin).
- **Dependencies:** none new.
- **Limits:** uploads up to 10 MB, `.xlsx` only, stored in the database for now. The historical import may move files to object storage later.
