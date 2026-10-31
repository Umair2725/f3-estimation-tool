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

Running the seed again resets these users to the roles above. The seed and the development sign-in both refuse to run in production. The seed also creates three sample estimation requests with fictional clients (Northwind Clinics, Contoso Logistics, Fabrikam Energy), two of them with sample hours, reset to the same state on every run.

## Estimation requests

1. On **Home**, click **New estimation request**.
2. Work through the four steps:
   - **Project:** name, client, project manager, date
   - **Platforms & stack:** application types, operating systems, browsers, and the parts with their technologies
   - **Environment & compliance:** hosting, environments, app stores, compliance and non-functional needs
   - **Requirements:** the feature list (document upload comes later)
3. Every step is saved as a **Draft** when you move on, go back or click **Save & exit**. **Continue where you left off** on Home reopens your latest draft at the step you last saved.
4. **Finish** checks that the request has a client, at least one part with a technology, and at least one feature, then opens the request page.

Who can do what:
- Everyone with a role can see every request.
- Only the owner or an Admin can edit a request (while it's a Draft or has Changes requested) or delete a draft.

**Settings → Tech stack** (Admins only):
- add technologies and choose which parts each applies to
- retire old ones: they disappear from the wizard, but requests that already use them keep them

The catalog starts with the technologies from the product brief.

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
