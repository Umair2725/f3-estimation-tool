# F3 Estimation Tool

Folio3's internal tool for estimating software projects. It reuses past estimates and the hours teams really spend building features with AI. See the product brief: [docs/product-brief.md](docs/product-brief.md).

> **Status:** project foundation only: app shell, database, health check and tooling. Estimation features arrive in later changes. Work is planned with [OpenSpec](https://github.com/Fission-AI/OpenSpec) in [`openspec/`](openspec/).

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
npm.cmd run dev              # http://localhost:3000
```

### Option B: run everything in containers (demos)

```powershell
docker compose up --build    # database + app; http://localhost:3000
```

The app container checks its settings, applies migrations, then starts.

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

## Scripts

| Script | What it does |
|---|---|
| `dev` | Development server with hot reload |
| `build` / `start` | Production build / start (`start` checks settings first) |
| `check-env` | Validate settings |
| `lint`, `format`, `format:check`, `typecheck` | Code quality |
| `test` | Unit tests (Vitest) |
| `test:e2e` | Smoke tests in a browser (Playwright). Needs `npm run build` first and a running database |
| `db:deploy` | Apply migrations |
| `db:migrate` | Create and apply a new migration during development |
| `db:generate` | Regenerate the Prisma client (also runs after `npm ci`) |
| `db:studio` | Browse the database |

First time running end-to-end tests: `npx.cmd playwright install chromium`.

## Client data: never commit it

Real estimates, SOWs and RFPs used for demos or imports go in **`/samples/`**, **`/uploads/`** or **`/local-data/`**. These folders, and every `.env` file, are ignored by git and excluded from container builds. Only `docs/templates/` (the empty Folio3 template) and `data/` (the feature benchmark list, with no client names) are tracked.

## Project layout

```
src/app/            pages and API routes (Next.js App Router)
src/app/api/health  health check
src/lib/            settings (env), logger
src/server/         server-only code: database client, health logic
prisma/             database schema and migrations
scripts/            check-env (startup settings check)
e2e/                Playwright smoke tests
docker/, Dockerfile, compose.yaml   containers
docs/               product brief, Excel template
data/               feature benchmark seed and survey
openspec/           specs and planned changes
```

## Tech

Next.js 16 (React 19, TypeScript), Tailwind CSS 4, PostgreSQL 17 + pgvector, Prisma 7, Vitest, Playwright, GitHub Actions. The reasons for each choice are in [`openspec/changes/setup-project-foundation/design.md`](openspec/changes/setup-project-foundation/design.md).
