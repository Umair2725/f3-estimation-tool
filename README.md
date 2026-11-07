# F3 Estimation Tool

Folio3's internal tool for estimating software projects. It reuses past estimates and the hours teams really spend building features with AI. See the product brief: [docs/product-brief.md](docs/product-brief.md).

> **Status:** foundation plus sign-in and roles: app shell, Google sign-in for `@folio3.com`, roles, people management, database, health check and tooling. Estimation requests (Home, the four-step wizard, the tech stack catalog), hours entered by hand and the internal Excel export are in; AI matching, review and the client-facing export arrive in later changes. Work is planned with [OpenSpec](https://github.com/Fission-AI/OpenSpec) in [`openspec/`](openspec/).

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 26 (see `.nvmrc`) | `node --version` |
| Git | any recent | |
| Container runtime | Rancher Desktop | Free alternative to Docker Desktop. Needs WSL 2 on Windows. |

### Rancher Desktop on Windows (one-time, needs admin)

1. Open **PowerShell as Administrator** and install WSL 2 without a Linux distribution:
   ```powershell
   wsl --install --no-distribution
   ```
   **Restart Windows** afterwards. Then check with `wsl --status`. If it says *"WSL2 is unable to start since virtualization is not enabled"*, run the same admin command again and restart once more: the "Virtual Machine Platform" feature only switches on after a restart. If the error persists, virtualization is off in the BIOS. On company laptops, ask IT to enable it.
2. Install Rancher Desktop (an admin prompt appears):
   ```powershell
   winget install --id SUSE.RancherDesktop -e
   ```
3. Start Rancher Desktop. In **Preferences**:
   - set **Container Engine** to **dockerd (moby)**
   - **untick Kubernetes** (not needed, saves memory)

   Or do both from the command line:
   ```powershell
   & 'C:\Program Files\Rancher Desktop\resources\resources\win32\bin\rdctl.exe' start --container-engine.name=moby --kubernetes.enabled=false
   ```
   The first start takes a few minutes.
4. Open a **new** terminal (so it picks up the updated PATH) and check:
   ```powershell
   docker version
   docker compose version
   ```

> **PowerShell tip:** if `npm` fails with "running scripts is disabled on this system", use `npm.cmd` instead (for example `npm.cmd run dev`), or run the commands in Command Prompt.

## Run it

First time only:

```powershell
npm.cmd ci
copy .env.example .env
```

### Option A: develop with hot reload

```powershell
docker compose up -d db      # start PostgreSQL (with pgvector) in a container
npm.cmd run db:deploy        # apply database migrations
npm.cmd run db:seed          # create the development test users (safe to repeat)
npm.cmd run dev              # http://localhost:3000
```

Open http://localhost:3000 and use **Development sign-in**: pick a test user and enter the password from `DEV_USER_PASSWORD` in `.env`. Use the same address as `AUTH_URL` (by default `http://localhost:3000`); sign-in from any other address or port is refused.

### Option B: run everything in containers (demos)

```powershell
docker compose up --build    # database + app; http://localhost:3000
```

The app container checks its settings, applies migrations, then starts. It runs in production mode, so development sign-in is off: it needs `AUTH_SECRET` and the Google settings below in `.env`.

### Check it works

- Home page: http://localhost:3000
- Health check: http://localhost:3000/api/health. It returns `200` with `"status":"ok"` when the app and database are fine, and `503` with `"status":"error"` when the database is down.

Stop with `docker compose down`. Add `-v` to also delete the local database.

## Settings

All settings are environment variables, documented in [`.env.example`](.env.example). The app **refuses to start** if a required setting is missing or invalid, and names the setting without printing its value. To check your settings:

```powershell
npm.cmd run check-env
```

| Setting | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | – | PostgreSQL URL (`postgresql://…`) |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn` or `error`; logs are JSON lines |
| `AUTH_SECRET` | yes | – | At least 32 random characters; signs session cookies. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_URL` | yes | – | The address people open, for example `http://localhost:3000`. Sign-in from any other address is refused |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | in production | – | Google OAuth client (see below). Optional locally when `AUTH_DEV_LOGIN=1` |
| `ADMIN_EMAILS` | no | – | Comma-separated `@folio3.com` emails that become Admin on first sign-in |
| `AUTH_DEV_LOGIN` | no | `0` | `1` turns on development sign-in. **Refused when `NODE_ENV=production`** |
| `DEV_USER_PASSWORD` | no | example value | Password of the seeded development users |
| `DOCUMENT_READER` | no | `claude` | Who reads requirement documents: `claude` (needs `ANTHROPIC_API_KEY`) or `stub`, a test-only reader refused in production |
| `SMTP_HOST` | no | – | Mail server. Empty = no email is sent (see [Email](#email)) |
| `SMTP_PORT`, `SMTP_SECURE` | no | `465`, TLS on 465 | Port, and `true` for TLS from the start or `false` for STARTTLS |
| `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | when `SMTP_HOST` is set | – | Mail account, its (app) password, and the sender address |

## Sign-in and roles

Only verified **`@folio3.com` Google accounts** can sign in. Sessions last 12 hours and are stored in the database, so deactivating someone signs them out at once.

| Role | Create and edit estimates | Approve estimates | Manage people and settings |
|---|---|---|---|
| Estimator | yes | – | – |
| Tech Lead | yes | yes | – |
| Architect | yes | yes | – |
| Admin | yes | – | yes |

- **First Admin:** put your email in `ADMIN_EMAILS` before you sign in for the first time. Removing it later doesn't remove the role.
- **Everyone else** sees a "Waiting for access" page after their first sign-in, until an Admin gives them a role under **Settings → People and roles**. Admins can also invite an `@folio3.com` address with a role before the person signs in, and deactivate or reactivate people. There must always be at least one active Admin.

### Create the Google OAuth client (one-time, product owner or IT)

1. In the [Google Cloud console](https://console.cloud.google.com/) for the Folio3 organization, create or pick a project.
2. **APIs & Services → OAuth consent screen**: choose **Internal** (only Folio3 Workspace accounts), app name "F3 Estimation Tool", scopes `openid`, `email`, `profile`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**:
   - Authorized JavaScript origin: `http://localhost:3000` (add the hosted address later)
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never paste the secret into chat, tickets or git.
5. Restart the app. "Continue with Google" is now enabled.

### Development sign-in

With `AUTH_DEV_LOGIN=1` (the `.env.example` default) the sign-in page also shows **Development sign-in**, for working without Google. `npm.cmd run db:seed` creates these users, all with the `DEV_USER_PASSWORD` password:

| User | Role |
|---|---|
| `dev.estimator@folio3.com` | Estimator |
| `dev.techlead@folio3.com` | Tech Lead |
| `dev.architect@folio3.com` | Architect |
| `dev.admin@folio3.com` | Admin |
| `dev.newcomer@folio3.com` | none (shows the waiting page) |

Running the seed again resets these users to the roles above. The seed and the development sign-in both refuse to run in production. The seed also creates three sample estimation requests with fictional clients (Northwind Clinics, Contoso Logistics, Fabrikam Energy), two of them with sample hours ("Field service app" is won, with actual hours), reset to the same state on every run.

## Email

Invitations, "you now have access" and the six review and reference-hours updates are emailed as well as shown in the app. Each email links to the page the update opens. Emails never contain hours, rates or totals.

- Emails are saved with the action and sent right after it, so an action that fails sends nothing.
- A failed email never stops the action. It's retried on the next action, up to 3 attempts, and an Admin can retry it.
- With no `SMTP_HOST`, nothing is sent. Emails are listed as "Not sent" so you can see what would have gone out.
- Tests never send real email: integration and e2e runs switch email off even when `.env` has SMTP settings.

### Send through Gmail (one-time)

1. Use the Gmail or Google Workspace account the emails should come from. A shared mailbox such as `estimation@folio3.com` is best.
2. Turn on **2-Step Verification** for that account (Google account → Security).
3. Create an **app password**: Google account → Security → 2-Step Verification → **App passwords**, name it "F3 Estimation Tool" and copy the 16-character password. If the option is missing, your Workspace admin has turned app passwords off; ask IT.
4. Add these to `.env`, then restart the app. Never paste the password into chat, tickets or git.
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=estimation@folio3.com
   SMTP_PASSWORD=the-app-password
   MAIL_FROM=estimation@folio3.com
   ```
5. Open **Settings → Email** as an Admin and click **Send test email**.

Gmail sends up to about 500 emails a day from a personal account and 2,000 from Workspace, far more than the tool needs. Another mail service (the Workspace relay, Amazon SES) only needs different settings.

### Settings → Email (Admins)

Shows whether email is set up (never the password), **Send test email**, and the latest 50 emails with their status: Sent, Failed with the reason (and **Retry**), or Not sent. **Settings → People and roles** has **Resend** next to each pending invitation.

## Estimation requests

1. On **Home**, click **New estimation request**.
2. Work through the four steps:
   - **Project:** name, client, project manager, date
   - **Platforms & stack:** application types, operating systems, browsers, and the parts with their technologies
   - **Environment & compliance:** hosting, environments, app stores, compliance and non-functional needs
   - **Requirements:** the feature list, and requirement documents (see [Requirement documents](#requirement-documents))
3. Every step is saved as a **Draft** when you move on, go back or click **Save & exit**. **Continue where you left off** on Home reopens your latest draft at the step you last saved.
4. **Finish** checks that the request has a client, at least one part with a technology, and at least one feature, then opens the request page.

Who can do what:
- Everyone with a role can see every request.
- Only the owner or an Admin can edit a request (while it's a Draft or has Changes requested) or delete a draft.

**Settings → Tech stack** (Admins only):
- add technologies and choose which parts each applies to
- retire old ones: they disappear from the wizard, but requests that already use them keep them

The catalog starts with the technologies from the product brief.

## Requirement documents

On the **Requirements** step, upload the client's RFP or specification (**PDF**) or a Folio3 SOW (**Word .docx**), up to 25 MB each, and say which it is. Files are checked by their content, not their name. Everyone who can see the request can download them; only the owner or an Admin can upload, remove or add from them.

1. **Claude reads each document** in the background, usually within 2 minutes. PDFs go to Claude as documents, so scanned pages are read too; Word files are converted to text first. Without `ANTHROPIC_API_KEY`, upload still works and the document says AI reading isn't set up.
2. When it says **Ready to review**, click **Review**. Claude proposes:
   - features, with a description and the parts they need
   - request details for steps 1–3: project name, client, platforms, browsers, technologies from the catalog, hosting, environments, app stores, compliance and non-functional needs
   - assumptions and risks per part, and **questions for the client**
3. Every item shows its **document, page (or Word section) and quote**:
   - **Quote checked**: the quote was found in the file's own text
   - **Check the page**: a scanned page or a quote that wasn't found; the link opens the PDF at that page
   - **Needs confirmation**: Claude wasn't sure
4. Tick what to keep and edit anything. You can **merge** ticked features (keeping all their sources), **split** one, or delete one. A feature already in the request is flagged and unticked, and so is a detail that would change something you filled in.
5. **Add to request** adds only what's ticked, in one save. New features get estimate Tasks and are matched straight away. A technology the catalog doesn't have is noted under step 3's other considerations.

Nothing changes until you click **Add to request**. You can review a document again later; items already added show as **Added**. **Questions for the client** appear on the request page, where you can also type your own; they aren't in the Excel export yet.

Documents are stored in the database with their request (deleting a request deletes them) and are sent only to Claude for reading. Their text is never logged, emailed or exported.

## Hours and the Excel export

**Estimating hours.** On a request page, click **Estimate hours**:
- Every feature is a **Task** on each part it belongs to (one tab per part).
- Add **Sub tasks** with Min and Max hours (0–9999, one decimal) and a comment.
- Each part also has **Deployment** hours (labelled with the request's environments), **Assumptions** and **Risks**.
- The side panel has the overheads: **QA %** and **PM %** (each can be turned off), **bug fixing %**, the **hourly rate** from the approved list, and **Rate confirmed**.
- Totals update as you type: each part (development + bug fixing + deployment), QA, PM, the total, and the cost at the rate.
- **Save** stores everything. Only the owner or an Admin can change hours; everyone else sees them read-only.
- The Home list and the request page show each request's total once it has hours.

**Before you export**, a checklist warns about:
- Min more than Max
- Sub tasks with 0 hours
- Tasks with no Sub tasks
- features with no hours
- an unconfirmed rate, or a rate that's no longer approved
- text that names another client

Warnings don't block the internal export.

**Export (internal)** downloads `<project> – Estimate (internal) – <date>.xlsx`. It's built from [`docs/templates/Empty_Estimation_Sheet.xlsx`](docs/templates/Empty_Estimation_Sheet.xlsx), keeping its styles.
- **Summary:**
  - project details
  - one row per development sheet, linked by formula
  - QA and PM as percentage formulas, and a Total
  - the hourly rate cell, with Cost (Min) and Cost (Max) formulas, so changing the rate in Excel updates the cost
  - the special considerations from the request
  - Resources and Weeks left blank
- **One development sheet per part,** named like "Backend (Node.js)":
  - Tasks and Sub tasks, with every total as a formula
  - Bug Fixing as a % formula, Deployment, Assumptions, Risks, and the template's reference notes
- **Left out:** the QA, GD and PM detail sheets, the unused development sheets, Research Tasks, and the **Questions sheet** (it holds another project's sample questions).
- Exporting doesn't change the request's status. The request page shows who exported last.
- The client-facing export arrives with review and approval.

**Settings → Estimate defaults** (Admins only):
- what new requests start from: QA 25%, PM 30%, bug fixing 10%, default rate $30, approved rates $25–$50
- changes apply to requests created afterwards

## Outcome and actual hours

**Outcome.** On the request page, the owner, a Tech Lead, an Architect or an Admin records what happened:
- **Mark as won** (In delivery), **Mark as lost** (with an optional reason), or later **Mark as delivered**.
- Delivered locks the actual hours. Only an Admin can still change them, or reopen the project.
- Home shows the outcome under the status.

**Actual hours** (request page → **Actual hours**). Tech Leads, Architects and Admins record the real hours; everyone else sees them read-only.

- **In the tool:**
  - type the actual hours next to each Sub task; leave it empty if it wasn't built
  - add rows for unplanned work
  - **Save as a new version**
- **By upload:**
  1. Export the estimate.
  2. In Excel, replace the hours with the real hours: make Min and Max the same, or add an "Actual" column. Add rows for unplanned work and delete rows that weren't built.
  3. Upload the file (.xlsx, up to 10 MB).
  4. Check the preview:
     - every row is **Matched**, **Unplanned** or **Dropped**
     - renamed rows ("User login" → "User Login + OTP") are proposed as matches for you to confirm or reject
     - if Min and Max differ, Min is used and the row is flagged
     - you can fix hours and choose a part for unknown sheets
  5. Nothing is saved until **Save as a new version**. The original file is kept with its version.
- **Accuracy report:** estimated Min–Max vs actual hours by part and Task, with the variance against Min. It shows unplanned and dropped work separately, and is marked **Final** once the project is delivered.
- Home and the request page show "· actual N" next to the estimated total.

Until review and approval exist, any request with estimated hours can be marked as won.

## Importing past projects

Admins load Folio3's approved past estimates, with actual hours for delivered projects, under **Settings → Import past projects** (also in the sidebar).

- **Upload:**
  - **One project:** the estimate `.xlsx`, plus the actuals `.xlsx` if it was delivered.
  - **Many projects:** a `.zip` with **one folder per project**. Name the actuals file `…-actuals.xlsx` (or `_actuals`, or ` actuals`); the other `.xlsx` is the estimate. Files in the zip root are estimate-only projects, and other files are ignored and listed.
  - Limits: 10 MB per `.xlsx`, 100 MB per zip, 150 projects per batch.
- **Each project has a preview** (**Check**):
  - the Summary details, each sheet with its detected part, and every Task and Sub task with its source row
  - the parser's warnings
  - for delivered projects, the estimate-vs-actual comparison
- **Corrections on the preview:** fix the project name or client, choose a part (or Skip) for unknown sheets such as "MVP", rename or exclude rows, and swap the estimate and actuals files. Then **Save changes**.
- **Duplicates are recognised by file content, not file name:**
  - the same file again → "Already imported" (Skip or Keep both)
  - the same project and client with different content → "Possibly a newer version" (Link as new version, Treat as different, or Skip)
- **Approve and import** creates a read-only historical project, marked **Imported**, with its hours tagged as the pre-AI baseline.
  - Every Sub task keeps its source sheet and row.
  - With an actuals file it's **Delivered**, and its actual hours become version 1. Rows matched by similar names are flagged.
  - The original files can be downloaded from the project.
- **Reject** or **Skip** creates nothing. A file that can't be read fails only its own project.
- **The batch page** shows imported, waiting, skipped, rejected and failed projects, with reasons.

Real estimates are client data: keep them in `samples/` or `uploads/`, which git ignores, and never commit them.

## Review and approval

Unreviewed estimates never reach a client or the knowledge base.

- **Submit for review** (the owner, from the request page): choose a Tech Lead or Architect, never yourself.
  - The request must be complete, and no Sub task can have Min greater than Max.
  - While it's in review the request is locked for everyone, Admins included. The owner can **Withdraw** it, which is also how to move a review to someone else.
- **The review page** shows the totals, the parts, **Needs your attention** (the export warnings, such as zero hours or an unconfirmed rate), and every Task and Sub task with its comments.
  - The Approver, the owner and Admins can comment on the request, a Task or a Sub task.
  - Comments also show on the estimate page.
- **Request changes** needs a comment and unlocks the request for the owner.
- **Approve** stores a frozen copy of the estimate as that version. It's the only thing matching will use.
- **Edit as new version** turns an approved estimate into a Draft of the next version. The approved copy stays the source until the new version is approved. Imported projects can't be reopened.
- Every status change is in the request's **History**.
- **Notifications are in the app for now** (email comes later):
  - Tech Leads and Architects get a **Reviews** page, with a count in the sidebar.
  - Home shows **Awaiting my review** and **Updates**.
- Exports of anything not approved say **"DRAFT – not approved"** on the Summary sheet and its printed header.

## Matching

The tool suggests hours for each Task (one feature on one part) from Folio3's approved past work, and every number says where it came from.

- **The knowledge index** holds each Task of every request's latest approved version, plus every **Architect reference**.
  - Each entry is embedded by a small open-source model (`bge-small-en-v1.5`) running on the server, so estimate text never leaves it. Entries are stored in PostgreSQL with pgvector.
  - The index updates when a request or an import is approved and when actual hours are saved. `npm run reindex-knowledge` rebuilds it.
- **Find matches**, on the estimate page for one Task or for all of them, shows up to 5 similar past Tasks on the same part. Each has its similarity, source (with a link), date, stack, Min–Max and actual hours.
- **The suggestion** uses the first of these that's at least 77% similar:
  1. an Architect reference
  2. AI-era actual hours
  3. an approved AI-era estimate
  4. a pre-AI match, shown unchanged and labelled "the AI reduction isn't applied yet"
- **Accept / Adjust (with a reason) / Reject:** accepting replaces the Task's Sub tasks, each commented with its source (for example "From Patient portal MVP v1, Backend (Node.js)"). The note carries through to the Excel export. Save your own edits first.
- **No reliable match:**
  - **Ask an Architect** for reference hours. The Architect sees the request on the Reviews page and adds Sub tasks with Min/Max, or declines with a reason.
  - The reference is used at once for this Task and for every similar feature in later requests.
  - **AI guess** (optional): with `ANTHROPIC_API_KEY` in `.env`, Claude proposes Sub tasks labelled "AI-generated, no historical reference". Only the request's own feature, part and stack are sent; never client names or other estimates.
    - Sizing follows [agent-estimation](https://github.com/ZhangHanDong/agent-estimation) (MIT). Claude gives each Sub task base **rounds** (Boilerplate 1–2, Moderate 3–5, Exploratory 5–10, High uncertainty 8–15) and a risk level (Low 1.0, Medium 1.3, High 1.5, Very high 2.0, with a reason above Low). It never gives hours.
    - Min = base rounds, and Max = base rounds × the risk factor. Guesses with 2 or more Sub tasks get an "Integration and wiring" Sub task at 15% of the rounds.
    - Hours = rounds × **minutes per round** ÷ 60. The estimator enters the minutes next to "AI guess" (whole 1–480). It is pre-filled from **Settings → Estimate defaults → Default minutes per round** (starts at 60), which also sizes the guesses made when features are added from a document.
- The review page flags AI guesses, Tasks with no match and no hours, and Tasks waiting for a reference.
- **Settings:**
  - `EMBEDDINGS_PROVIDER` is `local` (default) or `stub` (tests only).
  - `EMBEDDINGS_CACHE_DIR` is where the model is cached.
  - `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (default `claude-opus-5-5`) are for AI guesses.
- **First run:** `npm run embeddings:download`, then `npm run reindex-knowledge`. The seed also rebuilds the index, and the Docker image has the model built in.

## Feature hours

The benchmark library (**Knowledge base → Feature hours**) holds what common features really take with AI. They're used first in matching.

- **Each benchmark** has an ID (`FB-012`), part and stack, what one instance includes, pre-AI hours (for comparison only), and AI-era hours: **experienced developer → Min** and **junior developer → Max**.
  - Status is Draft, Confirmed or Retired.
  - A benchmark without AI-era hours is never suggested. Design benchmarks wait until estimates have a Design part.
- **Import** (Admins): `data/feature-benchmarks.csv` (166 features) or the filled-in `feature-hours-survey.xlsx`.
  - You see a preview, and nothing is saved until you apply it.
  - Hours in the file become observations.
  - A "Confirmed by" name stays a note: only a Tech Lead or Architect can confirm in the tool.
- **Who can do what:**
  - Tech Leads, Architects and Admins add and edit.
  - Tech Leads and Architects confirm. Editing a confirmed benchmark's hours sends it back to Draft.
  - Architects and Admins retire.
- **Observations** are entered by Tech Leads and Architects, or come from **actual hours**. When saving actuals for an AI-era project you choose the team level, and Sub tasks taken from a benchmark feed it. Mixed teams are recorded but not used.
- **Recalculation** is a weighted mean, where the last 6 months count double.
  - A confirmed benchmark that would move more than 15% gets a **proposal** for an Architect on the Reviews page.
  - Every change is in the benchmark's **change log**, and the **trend** shows the hours over time.
- **Matching order:** a Confirmed benchmark, then a Draft benchmark, then the earlier sources. Accepting a benchmark links the Sub tasks to it.
- **Architect references** (answers to "Ask an Architect") become Draft benchmarks numbered FB-9001 onward.
- **The seed** imports the 166-row list and adds three **development sample values** (FB-012, FB-023 confirmed, FB-027), labelled "Development sample, not real data".

## Scripts

| Script | What it does |
|---|---|
| `dev` | Development server with hot reload |
| `build` / `start` | Production build / start (`start` checks settings first) |
| `check-env` | Validate settings |
| `lint`, `format`, `format:check`, `typecheck` | Code quality |
| `test` | Unit tests (Vitest) |
| `test:int` | Integration tests against the database: sign-in, roles, people management. Needs a running, migrated database |
| `test:e2e` | Browser tests (Playwright) for every role. Needs `npm run build` first and a running, migrated database; seeds the dev users itself. In CI the HTML report is kept for 30 days on every run (Actions → the run → Artifacts → `playwright-report`) |
| `db:deploy` | Apply migrations |
| `db:seed` | Create or reset the development test users (needs `AUTH_DEV_LOGIN=1`) |
| `db:migrate` | Create and apply a new migration during development |
| `db:generate` | Regenerate the Prisma client (also runs after `npm ci`) |
| `db:studio` | Browse the database |
| `parse-estimate` | Read a local estimate `.xlsx` and print what the parser finds (see below). Nothing is uploaded or stored |
| `embeddings:download` | Download the local embedding model for matching (once; the Docker build does it) |
| `reindex-knowledge` | Rebuild the matching index from approved estimates and Architect references. Safe to run repeatedly; the seed runs it too |
| `backfill-approved` | Give approved requests from before the review workflow (imports) their approved version 1. Safe to run repeatedly; the seed runs it too |

First time running end-to-end tests: `npx.cmd playwright install chromium`.

## Reading past estimate files

The parser in `src/server/estimate-parser/` reads Folio3 estimate workbooks, including old ones whose sheets and rows don't match the template. The historical import and actual-hours upload will build on it.
- **Reads by labels, not cell positions:** it classifies sheets by name and finds the S.No / Task / Minimum / Maximum header wherever it is.
- **Recalculates hours from the Sub tasks:** where the file's own totals differ, it warns and shows both numbers.
- **Skips leftovers:** template placeholders and skeleton sheets.

To check a real file locally, put it in `samples/`, which git ignores, and run:

```powershell
npm.cmd run parse-estimate -- "samples/Some estimate.xlsx"
```

You'll get:
- each sheet and the part it was classified as
- Task and Sub task counts and hours
- the Summary details: project, client, QA %, PM %
- every warning

Add `--json` for the full result. `npm.cmd test` also parses every file in `samples/`, as a smoke test that's skipped when the folder is empty.

## Client data: never commit it

Real estimates, SOWs and RFPs used for demos or imports go in **`/samples/`**, **`/uploads/`** or **`/local-data/`**. These folders, and every `.env` file, are ignored by git and excluded from container builds. Only `docs/templates/` (the empty Folio3 template) and `data/` (the feature benchmark list, with no client names) are tracked.

## Project layout

```
src/app/            pages and API routes (Next.js App Router)
src/app/(app)/      signed-in pages: home, estimates (wizard, request page), settings
src/app/sign-in/    sign-in page
src/app/api/        health check, auth (Better Auth), people API
src/components/     brand and app shell (sidebar, top bar)
src/lib/            settings (env), logger, estimation options and validation
src/server/         server-only code: database client, health, people, estimation requests, tech stack
src/server/auth/    sign-in setup, roles and permissions, session helpers
prisma/             database schema, migrations and dev seed
scripts/            check-env (startup settings check)
test/               integration test setup and helpers
e2e/                Playwright browser tests
docker/, Dockerfile, compose.yaml   containers
docs/               product brief, Excel template
data/               feature benchmark seed and survey
openspec/           specs and planned changes
```

## Tech

Next.js 16 (React 19, TypeScript), Tailwind CSS 4, PostgreSQL 17 + pgvector, Prisma 7, Better Auth, Vitest, Playwright, GitHub Actions. The reasons for each choice are in [`openspec/changes/setup-project-foundation/design.md`](openspec/changes/setup-project-foundation/design.md).
