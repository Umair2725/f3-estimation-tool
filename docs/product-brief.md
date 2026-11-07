# F3 Estimation Tool: Product Brief

| | |
|---|---|
| **Owner** | Umair Khan (Project Manager, Folio3) |
| **Status** | Draft v0.8, input for OpenSpec proposals |
| **Last updated** | 2026-11-02 |
| **Output template** | [docs/templates/Empty_Estimation_Sheet.xlsx](templates/Empty_Estimation_Sheet.xlsx) ("Folio3 Project Estimation Template v 0.5") |

**Changes in v0.8:** the product owner's decisions of 2026-11-02 (section 14).
- **F-05 AI-assisted reduction is out of scope.** Pre-AI matches are shown with their original hours and labelled pre-AI; the estimator adjusts them. AI-era benchmarks (F-24) and AI-era actual hours remain the way the tool reflects work with AI.
- **F-09 reads PDFs with Claude**, which handles scanned pages and gives page citations. DOCX is converted to text first.

**Changes in v0.7:** the product owner's answers of 2026-10-29 are recorded (section 14).
- **Feature hours survey:** 166 common features in [data/feature-hours-survey.xlsx](../data/feature-hours-survey.xlsx), for Tech Leads to record real hours with AI (experienced and junior developer).
- Architects and Tech Leads record actual hours after launch.
- **Team experience** decides Min vs Max.
- Bug fixing is 10%, and the default rate is $30.
- **Resource allocation and timeline are out of scope.** The tool produces estimates only.
- Requirement upload accepts PDF and DOCX.
- Same-name files are handled safely.
- Claude is the AI provider.
- **New section 17:** hosting and technical recommendation.

**Changes in v0.6:**
- **New F-24: AI-era feature benchmarks.** A table of commonly built features holding the hours the team actually spends on each **with AI**. The team fills it in; the tool uses it first in new estimates and keeps learning from actual hours. Seed file: [data/feature-benchmarks.csv](../data/feature-benchmarks.csv).
- **QA, PM and price** are now simple Summary rows: QA and PM as a percentage of development, and cost as total hours × an hourly rate the user enters.
- **SOWs were analysed** (section 16). They're Folio3's own proposals, built from the estimate, so they're attached to historical projects as context. A new suggested feature, **F-23 SOW draft from estimate**, is added.
- **Optional template blocks** (such as Data Ingestion and the Questions sheet) stay in the master template, but are only included when needed.

**Changes in v0.5:** 4 sample past estimates were analysed (section 15).
- The importer (F-08) now reads files **by labels and patterns, not fixed cells**.
- The parts are now Backend, Web/Frontend, Admin Panel, Mobile and Cloud/Infrastructure.
- The export always writes Task totals as formulas, because broken totals were found in the samples.

**Changes in v0.4:** decisions from the product owner are recorded (section 14).
- Only a **Tech Lead** or an **Architect** can approve an estimate.
- Actual hours are recorded by uploading **the same Excel template, filled in with the real hours**, against a Won project after delivery.
- Release 1 starts with a **bulk load of past projects that were estimated, approved and delivered**, each with its verified actual hours.
- Requirement upload supports **one format** in Release 1. Fields the AI can't find are left empty, and the estimator can add fields.

**Changes in v0.3:** four features are now core and in the first release, each fully specified: **F-08 Historical estimate import**, **F-09 Requirement document upload**, **F-10 Review and approval**, and **F-12 Actual hours tracking**. The release plan, user flow, data model and OpenSpec order are updated to match.

**Changes in v0.2:** the export now follows Folio3's real template and stays lean (development effort only by default; PM, QA and GD are optional). Estimates now include an **AI-assisted development reduction**, because historical hours were set before the team used AI for most of the work. Three-point estimates have been replaced by the template's Minimum/Maximum format.

---

## 1. Problem

Folio3 regularly receives estimation requests for new projects. Today each estimate is built mostly from scratch in the Excel template, even though many features ("user login with SSO", "Stripe payments", "admin dashboard", "push notifications") have been estimated many times before. As a result:

- **Repeated effort.** PMs and leads rebuild the same estimates for every request.
- **Inconsistent numbers.** The same feature gets very different hours depending on who estimates it.
- **Lost knowledge.** Past estimates sit in scattered Excel files, so nobody can search them or reuse them.
- **Outdated baselines.** Past hours assume manual development. With AI doing most of the coding, reusing them unchanged over-quotes and loses deals.
- **Slow turnaround.** Clients wait days for a number that could take hours.

## 2. Vision

An internal tool that turns Folio3's estimation history into a searchable knowledge base. A PM describes the project, adds or uploads its features, and picks the tech stack, deployment environment and compliance needs. The tool drafts a **lean** estimate in which every number traces back to a source:
- for common features, the **hours the team really spends with AI** (F-24), or
- otherwise, a cited past estimate **reduced for AI-assisted development** (F-05).

The team reviews it and exports it to Folio3's Excel template. As AI keeps making the team faster, the numbers follow, because every delivered project feeds its actual hours back into the benchmarks.

## 3. Users and roles

| Role | Who | Main jobs |
|---|---|---|
| **Estimator** | PMs, BAs, tech leads | Create requests, review AI suggestions, adjust hours, export |
| **Approver** | **Tech Leads and Architects** (only these two job roles) | Review, comment, request changes and approve before an estimate goes to the client. **Confirm feature benchmark hours (F-24).** |
| **Admin** | Tool owner / PMO | Users, tech stack catalog, AI reduction factors, adjustment rules, default QA/PM percentages |

## 4. Goals and success metrics

| Goal | Metric | Target (first 6 months) |
|---|---|---|
| Faster estimates | Median time from request to exported Excel | Down 50% |
| Reuse | Share of features matched to a past estimate | 60% or more |
| Trust in AI suggestions | Share of AI-suggested hours accepted with little change (±15%) | 70% or more |
| Competitive quotes | Total estimated hours compared with the pre-AI baseline for similar scope | Down 25–40%, without more overruns |
| Accuracy (once actual hours are recorded) | Average variance between estimated and actual hours | Within ±20% |

## 5. Core features

Feature IDs are for reference in OpenSpec changes.

### F-01 Authentication and roles
- **Demo phase:** sign in with an email and password (or an emailed sign-in link). Accounts are created by an Admin.
- **Folio3 deployment:** **"Sign in with Google"** using people's **Folio3 Google Workspace (Gmail) account** (decision of 2026-10-29), so there's no new password, and leavers lose access automatically. Only `@folio3.com` accounts are accepted. An Admin assigns each user's role (Estimator, Tech Lead, Architect, Admin) after their first sign-in. Google sign-in can also be switched on during the demo phase if it's ready.
- Roles as in section 3. Every API endpoint checks the caller's role.
- Admins invite and deactivate users. Deactivated users can't sign in, but their estimates are kept.

### F-02 Home screen
- A **"New estimation request"** button.
- A list of requests: project, client, owner, status (Draft, In review, Approved, Exported), total Min–Max hours and last updated date.
- Search and filter by client, status, owner and tech stack.

### F-03 Create an estimation request
A short wizard. Each step maps to the Excel **Summary** sheet:

1. **Project:** project name, client name, project manager, date → Summary B2, C5, C6, C7.
2. **Application type and platforms:** mobile, web or desktop; operating systems; browsers → "Special Considerations" rows 27–29.
3. **Tech stack:** picked from an Admin-managed catalog (React, Next.js, .NET, Node.js, Python, Flutter, React Native, Swift, Kotlin…), set separately for each part: **Backend**, **Web/Frontend**, **Admin Panel**, **Mobile**, **Cloud/Infrastructure**. Each part becomes one development sheet. (Past estimates use all five; see section 15.)
4. **Deployment environment:** cloud provider, on-premises or client-managed; staging and production; app stores → "Deployment" row 30, and the Deployment line on the development sheets.
5. **Compliance and non-functional requirements:** HIPAA, GDPR, SOC 2, PCI-DSS, accessibility, performance and load, security, documentation → "Performance", "Security" and "Documentation" rows 31–33, and "Other custom?" row 34.
6. **Features:** added one by one, from the feature library, or extracted from an uploaded document (F-09).

**Acceptance:** A request can be saved as a draft at any step.

### F-04 AI-assisted feature matching with source references
For each feature, the tool searches the knowledge base and shows:

- The **top 3–5 similar past features**, each with a similarity score, the source project, its date, its tech stack and its Min/Max hours (plus actual hours if recorded).
- A **suggested Min/Max**, chosen in this order:
  1. a **confirmed AI-era benchmark** for the feature (F-24), if one exists for that part and stack;
  2. otherwise, **AI-era actual hours** from similar features in delivered projects (F-12);
  3. otherwise, the best **pre-AI** matches, adjusted for tech stack and compliance (F-06) and shown with their original, pre-AI hours (F-05 is out of scope, decision of 2026-11-02);
  4. otherwise, an AI-only guess, clearly labeled.

  The suggestion always says which of these it used.
- A **reference link** for every suggestion, so the estimator can open the source estimate.
- A **"No reliable match"** label when similarity is below a threshold. The tool then gives a clearly marked AI-only guess or leaves the hours blank. It never presents a guess as historical data.
- **How the AI-only guess is sized** (decision of 2026-11-05). The guess uses the [agent-estimation](https://github.com/ZhangHanDong/agent-estimation) method:
  - The AI estimates each Sub task in **rounds** (one think, write, run and fix cycle), with a risk level and a reason, plus 15% for integration. It never gives hours.
  - The estimator enters **minutes per round** when asking for the guess. It is pre-filled with an Admin default (60 to start).
  - Min = base rounds, and Max = rounds × the risk factor, both converted with the minutes per round.
- **AI estimate on any Task** (decision of 2026-11-07). The estimator can also ask for this AI estimate on a Task that has a reliable match, as a second opinion. It replaces the suggestion, keeps the "AI-generated, no historical reference" label, and "Find again" brings the match back.
- **Accept**, **Adjust** (with a reason) or **Reject** for each suggestion.

**Acceptance:** Every proposed number either links to at least one source estimate or is labeled "AI-generated, no historical reference".

### F-05 AI-assisted development reduction (fallback)
> **Out of scope (decision of 2026-11-02).** Not built. Kept here for reference only; it may be reconsidered once AI-era benchmarks and actual hours show whether a reduction is still needed.

Historical hours reflect manual development. Folio3's teams now use AI tools for most of the coding. **When no AI-era benchmark (F-24) or AI-era actual hours exist for a feature**, the tool reduces **baseline** hours (historical or AI-guessed) before suggesting them. As the benchmarks grow, fewer features need this fallback.

- **Reduction factors by task category**, set by Admins. Starting defaults, to be calibrated against actual hours:

  | Task category | Examples | Default reduction |
  |---|---|---|
  | Boilerplate and standard features | CRUD screens, forms, standard APIs, auth scaffolding, unit tests | 40–50% |
  | Integration with known services | Payments, maps, push notifications, well-documented third-party APIs | 25–35% |
  | Complex business logic | Custom workflows, calculations, real-time sync, offline mode | 15–25% |
  | Research, new tech, deployment and infrastructure | Proofs of concept, unknown APIs, client-managed environments | 0–10% |

- **Team experience decides where in the range the estimate sits** (decision of 2026-10-29). How lenient to be is a Folio3 internal decision that depends on who does the work. Each request has a **Team experience** setting:
  - **Experienced:** the work is expected to take the **Minimum**. Suggestions use the experienced-developer hours, and the export's Max stays close to Min.
  - **Mixed** (default): normal Min–Max range.
  - **Junior:** the range leans to the **Maximum**, using the junior-developer hours.

  This applies to benchmarks (F-24) and to reduced pre-AI hours alike. It can be overridden per feature.
- Each feature gets a category (AI suggests one; the estimator can change it). The estimator can also **override the reduction** for a feature or for the whole request (for example, a client that doesn't allow AI tools).
- Internal views show **Baseline → Reduction % → Final** for each feature. The Excel export shows only the **final** Min/Max, plus a note in Comments, for example "Includes 40% AI-assisted reduction".
- Once actual hours are recorded (F-12), the tool reports how accurate each category's factor is, so Admins can tune it.

**Acceptance:** Reductions are never applied silently. The baseline, the factor used and any override are stored with each feature estimate.

### F-06 Tech stack, environment and compliance adjustments
- Admins maintain adjustment rules, for example "HIPAA adds X% to backend", "a client-managed on-premises deployment adds N hours", "Flutter is ×0.65 compared with two native apps".
- When a matched past estimate used a different stack, the suggestion shows the adjustment applied and why.
- Compliance choices suggest the extra work they require (audit logging, encryption at rest, an accessibility pass) as optional features.

### F-07 Lean Excel export (Folio3 template)
Export to the existing template ([docs/templates/Empty_Estimation_Sheet.xlsx](templates/Empty_Estimation_Sheet.xlsx)), keeping its layout, styles and formulas. **Fill in only what's needed, and leave out the rest.**

**Always included**
| Sheet | What the tool fills in |
|---|---|
| **Summary** | Project name, client, PM, date. **One Min/Max row per development sheet** (formulas link to the sheets). **QA** and **PM** rows as a percentage of total development (see below). Total; **price block** (see below); Resources and Weeks left blank (out of scope); Special Considerations rows 27–34 from the request |
| **Dev sheets**: one per part the project needs (Backend, Web/Frontend, Admin Panel, Mobile, Cloud/Infrastructure), each copied from the template's development sheet and named after its part and stack, for example "Backend (Node)" or "Mobile (React Native)" | Features as **Tasks** and their breakdown as **Sub tasks**, with Min/Max and Comments (including the source reference and AI reduction note); Assumptions & Constraints; Risks |
| **Questions** | Open questions for the client (F-13), with the Answer column left blank |

**QA and PM as percentages (Folio3 practice)**
- The Summary has a **QA** row and a **PM** row, each a formula: *percentage × total development hours* (Min and Max). No QA or PM sheet is needed.
- Defaults, confirmed by the product owner (2026-10-29): **PM = 30%**, **QA = 25%** of total development hours. Admins can change the defaults, and the estimator can change them, or turn either row off, for a single request. The percentage is shown in the Comments column. (Older estimates used other splits, such as QA 30–35% and PM 25%. Imported estimates keep their own percentages.)

**Price block**
- The hourly rate is pre-filled at **$30/h** (default, decision of 2026-10-29). The tool **asks the estimator to confirm the actual approved rate** for the request before export, and shows a warning on the checklist if it's still the default. The estimator picks from the **approved rates: $25, $30, $35, $40, $45, $50 per hour** (decision of 2026-10-29). Admins can change the default and edit the list.
- The Summary shows **Cost (Min) = total Min hours × rate** and **Cost (Max) = total Max hours × rate**, as formulas linked to the rate cell, so changing the rate in Excel updates the cost.
- Optionally, a few comparison rates can be shown side by side, as the samples do ($30 / $35 / $40).
- The price block is included in the **internal** export. In the **client-facing** export it's included only if the estimator ticks "Show price".

**Off by default (turned on per request)**
| Item | Default |
|---|---|
| QA Estimates sheet (detailed) | Off. The QA percentage row is used instead |
| PM Estimates sheet (detailed) | Off. The PM percentage row is used instead |
| GD Estimates sheet | Off. Turn on only when UI/UX design is in scope |
| "Other Development Activities" (memory leaks, code review, documentation) | Off, **except Deployment**, which is filled from the environment answers |
| Research Tasks | Only when a feature is marked as needing research or a proof of concept |
| Notes block (rows 75+ on the dev sheets) | Kept as is (it's reference text from the template) |

**Bug fixing: on, at 10%** (decision of 2026-10-29). Past estimates used 20–25%, but AI now writes most of the code and tests, so the default is **10% of development hours** on each development sheet's "Bug Fixing" line, as a formula. Admins can change the default, and the estimator can change it per request.

**Resources and timeline: out of scope** (decision of 2026-10-29)
- The tool produces **estimates only (hours and cost)**. How many people to engage, and the resulting timeline, are decided by the PM **after** the estimate is final, outside this tool.
- The tool doesn't fill the Summary's **Resources** and **Weeks** columns. The export **leaves them blank**, with the template's Weeks formulas removed so no misleading numbers appear, and the PM completes them in Excel if needed.
- The tool never shows team size, weeks or delivery dates.

**Template issues the export must handle**
- The template uses a fixed number of task and subtask rows. The export must **insert rows** for real features and keep the `SUM` and `SUMIF` formulas covering the new ranges.
- The Summary's "Development Estimates" row (C11/D11) only links to **Dev Mobile Estimates**. The export must give **each included development sheet its own Summary row** (as the past estimates do by hand) and sum them all in Total.
- **Task totals must always be formulas over their Sub tasks**, and the development total must cover every Task. In one sample, missing Task formulas made a sheet's total show 26–34 h when its Sub tasks added up to about 166–254 h (section 15).
- **Optional blocks stay in the master template** (decision of 2026-10-29). Blocks such as the "Data Ingestion" Task and the Questions sheet are sometimes needed, so they stay in the master template as **optional blocks**. The export includes a block only when the estimator turns it on, so sample content never leaks into an estimate by default.

**Review before sharing**
Mistakes happen, and the estimator checks and fixes them before anything goes to the client. Before export, the tool shows a **checklist of warnings**:
- Min > Max
- Sub tasks with 0 hours
- Tasks with no Sub tasks
- a feature in scope with no hours
- a development part with no Summary row
- content copied from another project (a sheet or SOW text naming a different project or client)

**Acceptance:** The file opens in Excel without errors, every total is a working formula, and removed sheets leave no broken references.

### F-08 Historical estimate import
*Why:* without past data, the matching in F-04 has nothing to search on day one. Past estimates use the same Folio3 template, so most of the import can be automatic.

**Two kinds of historical project**
| Kind | Files | Used for |
|---|---|---|
| **Delivered project** (the main Release 1 load) | The approved **estimate** file **plus** an **actuals** file: the same template, with the hours replaced by the verified hours spent | Matching (ranked highest) **and** accuracy and calibration reports |
| **Estimate only** (lost, or delivery hours unknown) | The approved estimate file | Matching only |

> **Note on "training":** loading delivered projects doesn't retrain an AI model. It fills the knowledge base that matching searches, and gives the accuracy and calibration reports (F-12) real data. Those past actual hours mostly come from projects built **before** AI-assisted development, so they show how accurate the **baseline** estimates were. Checking the **AI reduction factors** (F-05) needs projects delivered with AI after launch.

**Upload**
- Admins upload past projects in one **import batch**, either:
  - one project at a time: an estimate file, plus an optional actuals file, or
  - in bulk: a `.zip` with **one folder per project**, each holding the estimate file and, for delivered projects, the actuals file. The tool tells the two apart by a file-name suffix (`…-actuals.xlsx`); on the preview screen the user can swap them if it guessed wrong.
- For each estimate file, the tool records the project name, client, PM and date from the Summary sheet (B2, C5, C6, C7) and the Special Considerations rows 27–34.
- A project with an actuals file is saved as **Won → Delivered**, and its actual hours are matched to the estimate rows exactly as in F-12.
- **Optional context documents:** the project's **SOW** (Folio3's proposal, `.docx`) and/or the client's **requirements document** (RFP, `.pdf`) can be attached. They're stored with the project and used to:
  - describe the project for project-level matching ("find past projects like this one")
  - record **in-scope and out-of-scope** features and the final tech stack
  - check that the estimate and the SOW agree (see section 16)
- **The parts on each estimate depend on its SOW and requirements**, so the importer never assumes a fixed set of sheets. The user confirms which part each sheet is on the preview.

**Extraction**
The sample files (section 15) showed that past estimates **don't** follow the template's fixed rows or sheet names, so the parser **reads by labels and patterns, never by fixed cell positions**:

- **Find the sheets.** Classify every sheet by its name, using keywords and confirmation:
  - `backend`, `server`, `node`, `api` → **Backend**
  - `web`, `react`, `ui`, `frontend` → **Web/Frontend**
  - `admin` → **Admin Panel**
  - `mobile`, `app`, `flutter`, `react native`, `ios`, `android` → **Mobile**
  - `cloud`, `infra`, `devops` → **Cloud/Infrastructure**
  - `qa`, `gd`, `pm`, `question` → their own types
  - Anything unrecognised (for example "MVP") → **Unknown**, which the user assigns or skips
- **Find the table.** On each sheet, find the header row containing *S.No / Task / Minimum / Maximum / Comments* (it has been seen in rows 7, 8 and 10). Columns are found from that header.
- **Read the rows.** A row with a number in S.No and text in Task is a **Task**. The rows below it with text and hours, but no S.No, are its **Sub tasks**, until the next Task or section label.
- **Find the sections** by their labels: "Development Total Efforts", "Other Development Activities", "Research Task", "Assumptions & Constraints", "Risks", "Notes".
- **Calculate hours from the Sub tasks; don't trust the file's totals.** Many formulas have no saved result, or don't cover every Task. If the file's own total differs from the calculated one, show a warning with both numbers.
- **Header details:** the sheet's title row (often the stack, for example "*Project* (Node)", "*Project* (React Native)"), date, and "By: *estimator* / Reviewed by: *reviewer*". The reviewer becomes the historical approver.
- **Skip:**
  - template placeholders ("Sub task -1", "Task -2", "<Research Task …1>", "<List down…>", rows with 0/0 hours)
  - the Notes block
  - the template's sample Questions and Assumptions
  - **skeleton sheets**: numbered rows with no Task text or hours. These are listed as "no data", not silently dropped.
- **Other development activities:** bug fixing (often a formula, e.g. 20–25% of development in past estimates; 10% from now on), builds and deployment are imported as their own rows. Bug fixing is stored as a **percentage**, not as a Task.
- **Summary-level QA and PM:** past estimates often set QA and PM as a percentage of development (QA 30–35%, PM 25%) instead of filling those sheets. Store the percentages; there are no Tasks to import.
- **Free-form tables** that don't match the Task/Sub task layout (for example an "Overall Estimations" block on the Summary) are shown on the preview for **manual mapping** or skipping.
- **Stack:** read from the sheet titles and names, the Assumptions text and the Summary; otherwise the reviewer picks it on the preview.
- Also read Research Tasks, Assumptions & Constraints, Risks and the Questions sheet when they contain real content.
- **Comments typed outside the table** (for example a reviewer's note in column A) are imported as notes, not as Tasks.

**Preview and confirmation**
- Before anything is saved, show a **preview** for each file: the extracted Tasks and Sub tasks with hours, the detected stack and a list of warnings (unreadable sheet, missing hours, Min > Max, a different template version).
- The reviewer can fix the stack, rename or exclude rows, and mark the file **Approved as historical source** or **Rejected**.
- For delivered projects, the preview also shows the **estimate vs actual** comparison (matched, unplanned and dropped rows; see F-12).
- **Duplicates and same-name files:** different users often upload **files with the same name** (for example "Estimation_Sheet.xlsx" or "SOW v1.0.docx") for **different** projects, and the same project may be uploaded twice under different names. So the tool **never identifies a file by its name**. Every upload gets its own ID, plus a **content fingerprint** (a hash of the file) and the project details read from it (project name, client, PM, date, sheet titles).
  - **Same content** as an existing file → "already imported", offering *Skip* or *Keep both*.
  - **Same project details but different content** → "possibly a newer version of project X", offering *Link as new version*, *Treat as a different project* or *Skip*.
  - **Same file name, different project** → treated as a separate project, with no warning.
  - Each file is always shown with **who uploaded it and when**, so same-name files can be told apart.
- **Requirements documents and SOWs are linked to an estimate explicitly** by the user, never by matching file names. If the content clearly doesn't match the estimate (for example an RFP for consulting attached to a software estimate), the tool warns.

**Storage**
- Imported estimates are stored as **historical, pre-AI** estimates: their hours are treated as the *baseline*, which F-05 reduces when they are reused.
- Every imported Sub task keeps a link to its source file name, sheet and row, so references in F-04 can say "Project X, Dev Backend Estimates, row 19".
- The original file is stored, so it can be downloaded again from the reference link.

**Acceptance**
- A file in the v0.5 template imports with every non-placeholder Task and Sub task, with correct Min/Max and part.
- Nothing becomes searchable until a person approves the preview.
- Importing the same file twice doesn't create duplicates unless the user chooses *Keep both*.
- A file that can't be parsed is reported with a reason and doesn't stop the rest of the batch.
- A batch of at least 100 projects (estimate + actuals) can be imported in one go, with a summary at the end: imported, skipped, failed, and why.

### F-09 Requirement document upload and feature extraction
*Why:* most requests arrive as an RFP, SOW, spec or email. Pulling out the features automatically saves the most time.

**Upload**
- **Release 1 supports two formats** (decision of 2026-10-29):
  - **PDF**: the client's requirements (RFPs, specs, briefs)
  - **Word `.docx`**: Folio3's SOWs and any Word requirements
- In step 6 of the wizard (F-03), upload one or more PDF or DOCX files, up to 25 MB each, and say what each one is: *client requirements* or *Folio3 SOW*. Other formats (email, Excel feature lists, slides) come later.
- Scanned PDFs are read with OCR; if the text is unreadable, the user is told which pages failed.
- **Missing information stays empty.** Any request field the AI can't find in the document is left blank (not guessed), and the estimator fills it in. The estimator can also **add fields or items** the document didn't cover.

**Extraction**
- The AI reads the documents and proposes:
  - **Tasks and Sub tasks**, grouped by part (Backend, Web/Frontend, Admin Panel, Mobile, Cloud/Infrastructure), each with a short description.
  - **Request details** it can infer: application type, platforms, browsers, tech stack, deployment environment and compliance (HIPAA, GDPR…). These pre-fill wizard steps 2–5, marked "from document", for the user to confirm.
  - **Assumptions** and **Risks** it notices.
  - **Questions for the client** where the document is unclear or contradictory (filling the template's Questions sheet; see F-13).
- **Every extracted item cites its source:** document name, page and a short quote, so the estimator can check it.
- Items the AI is unsure of are flagged "Needs confirmation".

**Review**
- The user sees the proposed list and can accept, edit, merge, split or delete items before they are added to the request. Nothing is added without confirmation.
- Accepted features go straight into matching (F-04).

**Acceptance**
- A typical 10–20 page RFP produces a reviewable feature list in under 2 minutes.
- Every extracted feature links to the page and quote it came from.
- Uploaded documents are visible only to people with access to the request, and are processed only by an approved AI provider (section 9).

### F-10 Review and approval workflow
*Why:* unreviewed AI numbers must never reach a client, and only approved estimates should become sources for future matching.

**Statuses:** `Draft → In review → Changes requested → Approved → Exported (client)`

| Step | Who | What happens |
|---|---|---|
| Submit for review | Estimator (owner) | Picks an Approver (a **Tech Lead** or an **Architect**). The request is locked for editing. The Approver is notified in the app and by email. |
| Review | Approver | Sees a summary page: totals, the parts included, the AI reduction applied, features with **no reliable match** or **large overrides** highlighted, and the source references. Can comment on any Task or Sub task. |
| Request changes | Approver | Must leave at least one comment. Status → *Changes requested*; the request is unlocked for the Estimator. |
| Approve | Approver | Status → *Approved*. The approved version is frozen (a later edit creates a new version and needs approval again). |
| Export for client | Estimator | The **client-facing** Excel export is enabled only for *Approved* requests. *Draft* exports are still allowed but are watermarked "DRAFT – not approved" on the Summary sheet. |

**Rules**
- **Only users with the Tech Lead or Architect role can approve.** Admins assign these roles; other users never see the Approve button.
- One approval is enough.
- No one can approve their own request, even a Tech Lead or Architect who is also its estimator.
- **Only Approved estimates are added to the knowledge base** used by F-04. Drafts and rejected requests are never used as sources.
- Every status change records who, when and any comment.

**Acceptance**
- The client-facing export button is disabled for anything not *Approved*.
- A Draft estimate never appears as a match in F-04.
- Editing an Approved estimate creates a new version and returns it to *Draft*.

### F-12 Actual hours tracking
*Why:* comparing estimates with real effort is the only way to check the AI reduction factors (F-05) and improve future matching.

**Who enters actual hours: Architects and Tech Leads**
Today, nobody records actual hours per feature. The estimate's Min and Max are both guesses, though Min is usually close to reality. So after launch, **Architects and Tech Leads** enter the hours really spent, and the tool learns from them (F-24). Folio3 teams track time in different tools (Jira work logs and others), so the tool doesn't connect to any of them. Instead:

1. After a project is won, the request is marked **Won → In delivery**. (It can also be marked **Lost**, with an optional reason.)
2. During or after delivery, an Architect or Tech Lead records the **real hours spent**, in either of two ways:
   - **In the tool:** an "Actual hours" column next to each Sub task of the approved estimate. This is quickest for a few features.
   - **By Excel upload:** take the **same estimation Excel** (the approved export), replace the hours with the real hours, add rows for unplanned work, remove rows that weren't built, and upload it against the Won project.
3. Actual hours can be corrected later. Each change or upload is kept as a version, and the latest one counts.
4. When the numbers are final, the project is marked **Delivered** and its actual hours are locked (only an Admin can change them).
5. Actual hours can also be recorded **for a single feature without a full project**: "we built Stripe subscriptions with AI in 9 h". This goes straight into the feature benchmarks (F-24).

**Matching the actuals file to the estimate**
- Rows are matched by **sheet → Task → Sub task name**. Small renames ("User login" → "User Login + OTP") are matched by similarity and shown for confirmation.
- Each row is shown as one of:
  - **Matched:** estimated Min/Max vs actual hours, with the variance %
  - **Unplanned:** only in the actuals file (work that wasn't estimated)
  - **Dropped:** only in the estimate (not built)
- **Which number is "actual":** in an uploaded actuals file, Minimum and Maximum should both hold the real hours. If they differ, the tool takes the **Minimum** (the product owner notes that Minimum is usually closest to reality), flags the row, and lets the user correct it on the preview. An optional "Actual" column, if present, takes priority.
- **Past estimates without actual hours:** for imported estimates with no actuals, the tool treats **Minimum as the best guess** of real effort, but labels it "estimate, not actual", and never uses it to calibrate benchmarks.
- The user confirms the mapping on a preview screen before anything is saved, and can correct a row's hours there.

**Use**
- Matching (F-04) **ranks sources with actual hours higher** and shows "Estimated 40–56 h · Actual 38 h" in the reference.
- An **accuracy report** for each project shows estimated vs actual hours by part and task, and the variance %.
- A **calibration report** for Admins shows, for each AI reduction category (F-05), the average variance across delivered projects, and suggests a new factor (for example "Integration: estimates 18% too high, consider raising the reduction from 30% to 40%"). Admins decide; nothing changes automatically.

**Acceptance**
- An actuals file in the same template can be uploaded against any Won project, and every row ends up Matched, Unplanned or Dropped.
- Actual hours are shown next to the estimated Min/Max everywhere the estimate appears, including match references.
- Re-uploading replaces the previous actuals and keeps a history; a Delivered project's actuals can only be changed by an Admin.
- The calibration report is based only on delivered projects with actual hours, and shows how many projects each number comes from.
- The same matching logic is used for delivered projects imported in bulk (F-08).
- **Actual hours from AI-era projects also update the feature benchmarks (F-24)** for every Sub task linked to a benchmark.

### F-24 AI-era feature benchmarks (learning what features really take with AI)
*Why:* as AI tools improve, Folio3 builds the same features in fewer hours, so estimates keep getting lower. Past estimates (pre-AI) and fixed reduction percentages can't keep up. The tool needs to **know the hours the team actually spends with AI on each common feature, keep learning them, and use them in new estimates.** The same table serves as the **boilerplate list**: standard features with Architect-confirmed hours.

**The benchmark table** (*FeatureBenchmark*, one row per feature, per part and, optionally, per stack)
| Field | Meaning |
|---|---|
| Feature ID, module, feature name | For example `FB-012`, User Management, "Sign up (form + validation)" |
| Part, typical stack | Web/Frontend, Backend, Mobile, Cloud/Infrastructure, Design; for example React, Node.js, or Any |
| **What's included** | The scope of one instance. Keeps numbers comparable |
| Pre-AI Min/Max | From past estimates (for comparison only) |
| **AI-era hours: experienced dev / junior dev** | Hours actually spent **with AI** on one instance. **Experienced → Min, junior → Max** in estimates |
| AI tools used | For example Claude Code, Cursor, Copilot |
| Based on N projects | How much evidence there is |
| Status | *Draft* (entered, not confirmed) / *Confirmed* / *Retired* |
| Confirmed by, confirmed on | **Architect or Tech Lead** sign-off |
| Last updated, trend | How the hours changed over time |

**Getting the first numbers in**
- A survey workbook lists **166 common software features**: [data/feature-hours-survey.xlsx](../data/feature-hours-survey.xlsx). It has the same rows as the seed file [data/feature-benchmarks.csv](../data/feature-benchmarks.csv); instructions are in [data/README.md](../data/README.md).
  - **62** of the features come from past Folio3 estimates, with their pre-AI hours.
  - **104** are further common features (social login, 2FA, RBAC, notifications, file upload, maps, scheduling, i18n, offline mode, CI/CD, AI chat and RAG…) with no past hours yet.
- **Tech Leads fill in the real hours spent with AI** (experienced and junior developer), and an **Architect confirms** them. The workbook or CSV is imported with one click (Admin), or the rows are edited in the tool.
- New features can be added at any time.

**Learning: how the numbers keep up with AI**
- Every **observation** is stored: a real number of hours for a feature, with a date, the project (if any), the AI tools used and who entered it. Observations come from:
  - **manual entries** by Architects and Tech Leads ("we just built sign up with AI in 5 h"), and
  - **actuals uploads (F-12)**: when a delivered AI-era project's Sub task is linked to a benchmark, its actual hours become an observation automatically.
- Each observation records the **developer level** (experienced or junior). The benchmark's experienced and junior hours are recalculated from the matching observations, **giving recent observations more weight** (for example, the last 6 months count double). As the team gets faster, the numbers go down on their own.
- **Human control:** if a recalculation would move a *Confirmed* benchmark by more than a set threshold (for example ±15%), the change is proposed to an Architect instead of being applied. Small changes apply automatically and are logged.
- A **trend view** per feature shows pre-AI estimate → AI-era hours over time, for example "Sign up form: 10–12 h (2024 estimate) → 6 h (Q1 2026) → 4 h (Q3 2026)".

**Using the benchmarks in estimates**
- When a feature in a new request matches a benchmark (by name and description similarity, with the same part and stack), its **AI-era Min/Max is suggested first** (F-04, priority 1). The reference reads "Benchmark FB-012, confirmed by *name*, based on 4 projects, updated 2026-09".
- The estimator can accept, adjust or reject it, as with any suggestion.
- When a Sub task in an estimate is linked to a benchmark, that link is kept, so its actual hours can flow back after delivery.

**Acceptance**
- Benchmarks can be imported from the CSV, edited in the tool, and confirmed only by a Tech Lead or Architect.
- A matching confirmed benchmark is always offered before pre-AI history.
- Every change to a benchmark's hours is traceable to its observations.
- A benchmark with no AI-era hours is never used as priority 1; the tool falls back to AI-era actuals, then pre-AI matches.

## 6. Additional features (product owner recommendations)

**Should** = soon after launch; **Could** = later.

| ID | Feature | Priority | Why it matters |
|---|---|---|---|
| F-23 | **SOW draft from the approved estimate:** generate a first draft of Folio3's SOW (`.docx`) from the estimate. Scope comes from the Tasks and Sub tasks, plus Out of scope, Technology, Platforms and browsers, Assumptions and Cost (from the Summary and hourly rate). **Team composition, milestones and timeline are left as placeholders** for the PM, because resource and timeline planning is outside this tool. | Should | The two sample SOWs repeat the estimate almost line by line, and both contain text copied from other projects (section 16). Generating them from the estimate saves time and prevents those mistakes. |
| F-13 | **AI clarifying questions:** fill the template's **Questions** sheet with gaps and ambiguities to ask the client | Should | The template already has the sheet; good questions early mean fewer re-estimates. |
| F-11 | **Versions** for each estimate (v1, v2…), with a comparison view | Should | Clients change scope often. |
| F-14 | **Client confidentiality:** mask client names and limit which estimates can be used as sources | Should | NDAs; estimates contain sensitive scope. |
| F-15 | **Feature library:** pick features from the F-24 benchmark list while building a request (browse by module, part and stack) | Should | Faster entry and consistent naming. Now built on F-24, so it's small. |
| F-20 | **Audit log** of changes to hours and of AI suggestions accepted or rejected | Should | Accountability, plus data to improve matching. |
| F-16 | **Starter templates** ("E-commerce MVP", "Patient portal") | Could | Very fast first drafts. |
| F-19 | **Integrations:** push approved estimates to Jira; Slack or Teams notifications | Could | Smooth handover to delivery. |

Removed from v0.1 because the lean output doesn't need them: the per-role hour split, contingency overheads, multi-currency rate cards, and timeline and team planning (resource allocation and timelines are decided by the PM after the estimate is final, outside this tool). QA and PM percentages and a single hourly-rate price block came back in v0.6, in a simpler form (F-07).

## 7. Key user flow (MVP)

0. *One-time setup:* an Admin **bulk-imports past projects**: approved estimates, plus actuals files for those that were delivered (F-08). This way the knowledge base starts full and the accuracy reports have real data.
1. Sign in → Home → **New estimation request**.
2. **Upload the client's RFP or SOW** (F-09). The AI pre-fills project details, platforms, stack, environment and compliance, and proposes the feature list with page references. The estimator confirms or edits.
3. The AI matches each feature against **approved** past estimates, applies stack and compliance adjustments, then the **AI-assisted reduction**, and shows references (F-04, F-05).
4. The estimator accepts, adjusts or rejects each suggestion and finishes Assumptions, Risks and client Questions.
5. **Submit for review** → a Tech Lead or Architect comments, requests changes or **approves** (F-10).
6. Export the lean, client-facing Excel (only for Approved estimates).
7. The approved estimate joins the knowledge base.
8. If the project is won, after delivery the PM **uploads the same Excel filled in with actual hours** (F-12). Matching and the reduction factors improve over time.

## 8. Data model (conceptual)

- **User** (roles *Estimator / Tech Lead / Architect / Admin*, status; only Tech Lead and Architect can approve)
- **Client** (name, masked alias)
- **EstimationRequest** (project, client, PM, date, status *Draft / In review / Changes requested / Approved / Exported*, outcome *Won / Lost / In delivery / Delivered*, version, origin *new* or *imported*, application type, platforms, browsers, deployment, performance, security, documentation and other special considerations; included optional sections such as QA, PM and GD)
- **TechStackSelection** (part: Backend, Web/Frontend, Admin Panel, Mobile or Cloud/Infrastructure → technologies)
- **Task** (request, part, title, comments, research flag) → **SubTask** (title, Min, Max, comments)
- **FeatureEstimate** (subtask → baseline Min/Max, adjustment applied, AI task category, reduction %, override and reason, final Min/Max, source type: *historical*, *AI-only* or *manual*)
- **SourceReference** (feature estimate → source subtask, similarity score)
- **Assumption**, **Risk**, **ClientQuestion** (request or part → text, answer)
- **ImportBatch** → **ImportedProject** (kind *delivered* or *estimate only*) → **ImportedFile** (role *estimate* or *actuals*, stored original, parse status, warnings, duplicate decision, approved by) → imported Tasks/Sub tasks keep **source sheet and row**
- **SourceDocument** (request → uploaded RFP/SOW, OCR status) → **ExtractedItem** (type *feature / assumption / risk / question / request detail*, page, quote, status *proposed / accepted / rejected*)
- **Review** (request version → approver (Tech Lead or Architect), decision *approved / changes requested*, comment, timestamp), **Comment** (on a Task or Sub task)
- **ActualsUpload** (Won request → actuals Excel file, version, uploaded by, date, final flag) → **ActualHours** (estimated subtask, or a new *unplanned* subtask → hours, match status *matched / unplanned / dropped*, similarity of the name match)
- **ReductionFactor** (task category → default %), **AdjustmentRule** (condition → multiplier or added hours)
- **FeatureBenchmark** (feature ID, module, name, part, stack, what's included, pre-AI Min/Max, **AI-era hours: experienced / junior**, AI tools, observation count, status *draft / confirmed / retired*, filled by, confirmed by and on, last recalculated) → **BenchmarkObservation** (hours, **developer level** *experienced / junior*, date, project or none, source *survey / manual / actuals*, AI tools, entered by) → **BenchmarkChange** (old → new hours, auto-applied or proposed, decided by)
- **SubTask ↔ FeatureBenchmark** link (optional), so estimates and actual hours feed back into the right benchmark
- **EstimationRequest** pricing and overheads: hourly rate (USD, default $30, confirmed flag), QA % (25), PM % (30), bug fixing % (10), **team experience** (*experienced / mixed / junior*), show-price-to-client flag
- **UploadedFile** (ID, original file name, **content hash**, uploaded by, uploaded at, type *estimate / actuals / requirements / SOW*, linked project). The file name is never used as an identifier
- **ProjectDocument** (historical or new project → SOW `.docx` or requirements `.pdf`, type, in-scope and out-of-scope lists extracted)
- **ExportRecord**, **AuditEvent**

## 9. AI approach (guidance for design)

- **Retrieval first, then generation.** Store embeddings of past Tasks and Sub tasks with their stack and context; retrieve the closest matches, then let the AI explain and adjust them. It never invents "historical" numbers.
- **Every suggestion is cited**, with source IDs the UI links to.
- **Calculation order:** baseline (matched history) → stack and compliance adjustment → AI-assisted reduction → the estimator's decision. Each step is stored.
- **Confidence comes from evidence:** similarity, number of sources, whether actual hours exist and how recent the source is.
- **AI provider: Claude** (decision of 2026-10-29; Folio3 mostly uses Claude). In the demo phase, it's called through the Anthropic API. On Folio3 AWS, it can be called through **Amazon Bedrock**, so client data stays inside Folio3's AWS account. The specific Claude models (a larger one for document extraction and matching explanations, a smaller one for quick classification) are chosen in `setup-project-foundation`.
- **Similarity search** needs text embeddings, which Claude doesn't produce. Proposed: store embeddings in **PostgreSQL with pgvector**, generated by an embeddings service compatible with the chosen hosting (for example Voyage AI, or Amazon Titan Embeddings on Bedrock). Decide in `setup-project-foundation`.
- **Data privacy:** client documents and estimates are sent only to the approved AI provider, under settings that don't use inputs for training.

## 10. Non-functional requirements

- **Security:** SSO, role checks on every endpoint, encryption in transit and at rest, secrets in a vault.
- **Performance:** matching takes under 5 seconds per feature; a 100-subtask export takes under 30 seconds.
- **Reliability:** daily backups; the knowledge base is the core asset.
- **Usability:** a first draft of a 30-feature project in under 1 hour.

## 11. Release plan

| Phase | Scope |
|---|---|
| **Release 1** (MVP) | F-01 Auth, F-02 Home, F-03 Request wizard, F-07 Lean Excel export, **F-08 Historical import**, F-04 Matching with references, **F-09 Document upload**, **F-10 Review and approval**, **F-12 Actual hours** (actuals Excel upload and accuracy report), **bulk load of delivered projects**, **F-24 AI-era feature benchmarks** (CSV import, Architect confirmation, use in estimates, learning from actuals) |
| **Release 1.1** | F-13 Clarifying questions, F-06 Adjustment rules, F-12 calibration report, F-11 Versions, more requirement document formats |
| **Release 1.2** | F-14 Confidentiality, F-15 Feature library, F-20 Audit log |
| **Later** | F-16 Starter templates, F-19 Jira/Slack integrations |
| **Out of scope** | F-05 AI-assisted reduction (decision of 2026-11-02) |

Release 1 is larger now. If it needs to ship sooner, split it at the natural boundary: **1a** = Auth, Home, Wizard, Excel export, Historical import (with actuals), Review (a usable tool without AI, already loaded with past data); **1b** = Matching, Document upload.

## 12. Suggested OpenSpec changes, in order

Each item is a separate `/opsx:propose` run:

1. `setup-project-foundation`: choose the tech stack, repository structure, CI, database and environments
2. `add-authentication-and-roles` (F-01)
3. `add-estimation-request-wizard` (F-02, F-03)
4. `add-lean-excel-export` (F-07): built early, so the output format is fixed before the AI work
5. `add-template-parser`: one shared reader for the Folio3 template, used by the import, the actuals upload and tests of the export (built and tested against the sample past estimates)
6. `add-actual-hours-upload` (F-12): actuals Excel upload and estimate-vs-actual matching
7. `add-historical-estimate-import` (F-08): bulk import of estimates and delivered projects, reusing the parser and the actuals matching
8. `add-review-and-approval-workflow` (F-10): must exist before matching, so only approved estimates are searched
9. `add-ai-feature-matching-with-citations` (F-04)
10. `add-feature-benchmarks` (F-24): benchmark table, CSV import, confirmation, observations and recalculation; used as priority 1 in matching
11. ~~`add-ai-assisted-reduction-factors` (F-05)~~: out of scope (2026-11-02)
12. `add-requirement-document-extraction` (F-09)
13. Then the Release 1.1 items, one change each (F-23 SOW draft first, if approved)

## 13. Open questions

All questions so far are answered; the answers are in the decisions log (section 14). New questions will be added as the OpenSpec changes are proposed.

**Real data still to come (not blocking):**
- the **filled-in feature hours survey** ([data/feature-hours-survey.xlsx](../data/feature-hours-survey.xlsx)) from Tech Leads
- **3–4 delivered projects** with their actual hours, to test F-12 and seed F-24

## 14. Decisions log

| Date | Decision | Affects |
|---|---|---|
| 2026-10-29 | The output is Folio3's estimation template v0.5, kept lean: development effort only by default; PM, QA, GD and most overheads are off | F-07 |
| 2026-10-29 | Estimates include an AI-assisted development reduction, because past hours assume manual coding | F-05 |
| 2026-10-29 | Historical import, document upload, review and approval, and actual hours are all in Release 1 | F-08, F-09, F-10, F-12 |
| 2026-10-29 | **Only a Tech Lead or an Architect can approve** an estimate. One approval is enough | F-10, F-01 |
| 2026-10-29 | Requirement upload supports **one format** in Release 1. Missing fields stay empty, and estimators can add fields | F-09 |
| 2026-10-29 | Actual hours come from **re-uploading the same Excel template with the real hours** against a Won project after delivery. There's no time-tracking integration, since teams use different tools | F-12 |
| 2026-10-29 | Release 1 starts with a **bulk load of past estimated, approved and delivered projects with verified actual hours** | F-08 |
| 2026-10-29 | The **development parts and sheets depend on each project's SOW and requirements**; there's no fixed set | F-03, F-07, F-08 |
| 2026-10-29 | Mistakes in estimates are **verified and fixed by people before sharing**; the tool's job is to flag them | F-07, F-08 |
| 2026-10-29 | **QA and PM are Summary rows, as a percentage of development** (**PM 30%, QA 25%**, confirmed), instead of detailed sheets. *This replaces "PM and QA off" from the first decision.* | F-07 |
| 2026-10-29 | **Price = total hours × an hourly rate the user enters** | F-07 |
| 2026-10-29 | Occasionally-needed template content (such as Data Ingestion and the Questions sheet) **stays in the master template as optional blocks** | F-07 |
| 2026-10-29 | Repeated features become **boilerplates whose hours an Architect confirms** | F-24, F-15 |
| 2026-10-29 | The tool **learns the hours the team really spends with AI** for common features, starting from a seed list the team fills in, and uses them first in new estimates | F-24, F-04, F-05 |
| 2026-10-29 | **QA 25%, PM 30%** of development confirmed | F-07 |
| 2026-10-29 | **Architects and Tech Leads record actual hours** after launch, in the tool or by Excel upload; the AI learns from them. A survey of 166 common features collects AI-era hours now | F-12, F-24 |
| 2026-10-29 | Requirement upload accepts **PDF (client requirements) and DOCX (Folio3 SOWs)** in Release 1 | F-09 |
| 2026-10-29 | Estimate Min and Max are both guesses, but **Min is usually close to reality**. Min is used as the best guess for estimates without actual hours, and as the actual value when an actuals file is ambiguous | F-12 |
| 2026-10-29 | **Files with the same name from different users are different uploads.** Files are identified by ID and content, never by name, and documents are linked to estimates explicitly | F-08, F-09 |
| 2026-10-29 | **Default hourly rate $30**; the estimator confirms the actual approved rate per request | F-07 |
| 2026-10-29 | **Team experience sets where the estimate sits:** experienced → Minimum, junior → more lenient (toward Maximum). A Folio3 internal choice per request | F-05, F-24 |
| 2026-10-29 | **Resource allocation and timeline are out of scope.** The tool only produces estimates (hours and cost); the PM decides team size and timeline after the estimate is final. The Resources and Weeks columns are left blank in the export | F-07, F-23 |
| 2026-10-29 | **Bug fixing 10%** of development (was 20–25%), because AI writes most code and tests | F-07 |
| 2026-10-29 | **AI provider: Claude** | Section 9 |
| 2026-10-29 | **Sign-in with Google** (Folio3 uses Google Workspace / Gmail); only `@folio3.com` accounts | F-01 |
| 2026-10-29 | **Approved hourly rates: $25, $30, $35, $40, $45, $50**; default $30 | F-07 |
| 2026-10-29 | **Internal demos may use real past estimates** | Section 17 |
| 2026-10-29 | **Hosting:** demo first (no fixed host), then **Folio3 AWS** (section 17) | Section 17 |
| 2026-11-02 | **F-05 AI-assisted reduction is out of scope.** Pre-AI matches keep their original hours, labelled pre-AI; AI-era benchmarks and actuals reflect work with AI | F-05, F-04 |
| 2026-11-02 | **F-09 sends PDFs to Claude as documents** (scans and page citations included); DOCX is converted to text. Extraction covers features, request details, assumptions, risks and client questions | F-09 |

## 15. Findings from sample past estimates

Four real past estimates were analysed on 2026-10-29. Client names are left out here, and the files themselves are **not** stored in this repository.

| Sample | Project type | Development sheets with real data | Usable? |
|---|---|---|---|
| **A** | Web calculator and reports | "Dev Admin Estimates" (React web app), "UI Estimates" (frontend), "GD Estimates" (design). "Dev Backend Estimates" is an untouched template sheet. | **Yes**, about 55 Sub tasks with Min/Max |
| **B** | Web + Node backend + React Native app | "Web", "BackEnd", "MobileApp": about 150 Sub tasks with Min/Max and detailed comments. "Admin Panel", "Cloud Infra", "GD (Web)", "GD (Mobile)" and "MVP" are empty skeletons copied from another project. | **Yes**, the richest sample |
| **C** | Agentic AI assistant (React, Flutter, FastAPI) | The development, UI and GD sheets have **numbered rows but no task names or hours**; this is confirmed in the file itself. The only real numbers are a 7-line free-form table on the Summary (368 h) and a QA total. | **Mostly no**, needs a complete copy or manual mapping |
| **D** | — | An **unfilled copy of the template** (placeholders only) | **No** |

**What this means for the importer (F-08) and the export (F-07)**
1. **Sheet names vary widely:** "Dev Backend Estimates", "BackEnd", "Server", "Web", "React Web", "UI Estimates", "MobileApp", "Flutter (mobile app)", "Admin Panel", "Cloud Infra", "GD Estimates (Web)", "MVP". Sheets must be classified by keywords and confirmed by the user.
2. **Row positions vary:** the header row is at row 7, 8 or 10, and section totals move with the number of tasks. The parser finds tables and sections by their labels.
3. **File totals can't be trusted:**
   - In sample B, the backend sheet's Task rows have no `SUM` formulas, so the sheet total, and the Summary, show **26–34 h**, while its Sub tasks add up to **166–254 h**.
   - In sample C, formulas have no saved results at all.

   The importer recalculates from Sub tasks and warns about differences. The export always writes complete formulas.
4. **Minor data errors exist:** Min > Max (a deployment line with Min 8, Max 0), duplicate S.No numbers, dates written in many formats ("5th May 2025", "08/05/2.25", `DATE()`), and a reviewer's question typed into column A. The preview must show these as warnings, not fail.
5. **Useful details in the sheet headers:** "By: *estimator* / Reviewed by: *reviewer*", and the stack in the sheet title (for example "*Project* (Node)", "*Project* (React Native)"). The importer captures them.
6. **How PMs really estimate QA and PM:** as a percentage of development on the Summary (QA 30–35%, PM 25%), not on the QA or PM sheets. Bug fixing is 20–25% of development. This is now the QA and PM percentage rows in F-07. Folio3's standard going forward is **PM 30%, QA 25%**.
7. **Pricing is calculated in the sheet:** price at $30, $35 and $40 per hour, and team cost per month. This is now the price block in F-07 (default $30/h; the estimator confirms the approved rate).
8. **Similar features repeat across projects** (sign up and sign in, forgot password, profile, CRUD screens, chat over WebSocket, Stripe subscriptions, project setup). This confirms the matching and AI-reduction approach. For example, sample B's web and mobile apps estimate the same User Management Sub tasks at the same hours.
9. **No actuals files yet:** F-12 matching still needs a real estimate + actuals pair (3–4 delivered projects are to come; section 13).
10. **Test data:** samples A and B are the main test files for the parser. They should be kept outside git, or anonymised before being added as test files.

## 16. Findings from sample SOWs and requirements documents

Three documents were analysed on 2026-10-29: the SOWs for samples A and B (`.docx`), and a requirements document (RFP, `.pdf`) shared with sample C.

**1. SOWs are Folio3's output, not the client's input.** The SOWs are Folio3 proposals written *from* the estimate. They contain:
- Document overview
- Scope of work
- Out of scope
- Execution strategy
- Technology
- Supported platforms and browsers
- Approach and assumptions
- Team composition
- Milestones
- Cost & timeline
- Billing
- Signatures

So for **new** requests, F-09 reads the **client's** requirements document. For **historical** projects, the SOW is attached as context (F-08). Sample A's SOW is a good model for the target: its scope modules (Calculator: Machine / General / Operating / Capex / Network inputs, Model results, Formula imports; Charts; Monthly / Quarterly / Annual reports) match the estimate's Tasks and Sub tasks **one to one**.

**2. The SOW and the estimate don't always agree.** Checking them against each other catches real mistakes. In sample B:
- The estimate's backend sheet is titled **Node**, but the SOW proposes **.NET**.
- The SOW lists "Toggle notification" and "Image uploader" as **out of scope**, but the web and mobile estimates still include hours for them.
- The SOW lists 4 roles; the estimate's assumptions say 3.

**3. Text copied from other projects** appears in sample B's SOW, just as in its estimate's skeleton sheets: GIS, DWG import, Cesium pricing, map polylines and ticket milestones, and a different client name in the signature block. The pre-export checklist (F-07) and a generated SOW (F-23) both address this.

**4. Cost and timeline follow from the Summary.**
- Sample B: the SOW's standard cost (about $63.8k) ≈ total Max hours × $40/h, and the 14–15 week timeline matches the Summary's weeks.
- Sample A: the SOW gives 9–10 weeks, and the cost was left as a placeholder ("$00,000").
- Both bill change requests at **$35/h**.

This confirms the price block design (hours × rate) and makes generating an SOW draft (F-23) straightforward. Timelines in the SOWs come from the PM's resource planning, which stays outside the tool.

**5. The RFP shared with sample C doesn't match the estimate.** The product owner confirmed they're different engagements. It's a request for a phytosanitary policy consultant, with no software scope, so it can't be paired with that estimate. **Lesson:** documents and estimates must be linked explicitly, and same or similar file names from different users must never be assumed to belong together (F-08).

## 17. Hosting and technical recommendation

Input for the first OpenSpec change, `setup-project-foundation`. These are recommendations, to be confirmed there.

### Hosting, in two stages

**Stage 1: build and demo (now, no fixed host)**
- The tool runs on a laptop with **Docker** (the app plus a PostgreSQL database), started with one command. Demos can be given live from the laptop or over a screen share.
- Claude can't host the tool on its own servers. It can run it on this machine and open it in the browser for a demo.
- **Demos are internal, so they can use the real past estimates** (decision of 2026-10-29).
- If colleagues need a **link to try it themselves** before AWS is ready, the same Docker setup can go on a low-cost managed host. Because client estimates and SOWs would then be stored outside Folio3's systems, that host should allow **only Folio3 Google sign-in**, and the data should be deleted from it once the AWS version is live.

**Stage 2: Folio3 AWS (once people like it)**
Because everything runs in containers, moving from the laptop to AWS doesn't need a rewrite.

| Need | AWS service |
|---|---|
| Run the app | **ECS Fargate** (or App Runner for an even simpler start), from the same Docker image |
| Database | **RDS PostgreSQL** with the pgvector extension, daily automated backups |
| Uploaded files (estimates, SOWs, RFPs) | **S3**, private and encrypted |
| AI | **Claude through Amazon Bedrock**, so data stays in Folio3's AWS account |
| Secrets | **Secrets Manager** |
| Logs and alerts | **CloudWatch** |
| Sign-in | **Google sign-in** with Folio3 Google Workspace accounts (`@folio3.com` only) |

### Technology (proposal)
One language, TypeScript, across the whole tool. This fits the React and Node.js skills shown in Folio3's own estimates.

| Area | Proposal | Why |
|---|---|---|
| App (screens + API) | **Next.js (React)**, one app | Small internal tool, fastest to build and demo. Can split out a NestJS API later if it grows |
| Database | **PostgreSQL + pgvector**, with Prisma | Relational data and similarity search in one database |
| Excel read/write | **ExcelJS** | Keeps the template's styles and formulas; already used successfully to read the sample estimates and to build the survey workbook |
| Word / PDF reading | DOCX: mammoth to text. PDF: sent to Claude as a document, which reads scanned pages and cites pages | Covers SOWs and RFPs (F-09); no OCR engine to run (decision of 2026-11-02) |
| AI | Anthropic SDK (demo) / Amazon Bedrock (AWS) | Claude, as decided |
| Sign-in | Auth.js | Google sign-in restricted to `@folio3.com`; email sign-in as a fallback for local development |
| Background work (imports, extraction) | A job queue on PostgreSQL (e.g. pg-boss) | No extra infrastructure |
| Packaging | Docker + Docker Compose | The same image runs on a laptop, a demo host or AWS | It's still a useful example of a client RFP layout: background, deliverables, schedule, evaluation criteria, required proposal sections.
