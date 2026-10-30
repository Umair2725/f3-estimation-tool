# Design

## Context

- The repository has only planning material: `docs/product-brief.md` (v0.7), `docs/templates/` (the Folio3 Excel template), `data/` (feature benchmark seed and survey), and OpenSpec/Claude Code scaffolding. There is no application code yet.
- Brief section 17 sets the direction: TypeScript throughout, Next.js, PostgreSQL with pgvector, containers that run unchanged on a laptop and later on Folio3 AWS (ECS Fargate, RDS, S3, Bedrock), and Google sign-in later.
- The development machine is Windows 11 with Node.js 26 LTS and Git installed. **No container runtime is installed.** The product owner chose **Rancher Desktop** (free, open source) over Docker Desktop, which needs a paid licence at Folio3's size.
- The GitHub repository `Umair2725/f3-estimation-tool` is private, so CI runs on GitHub Actions.
- Requirements: `specs/system-health/spec.md` and `specs/app-shell/spec.md`.

## Goals / Non-Goals

**Goals:**
- A skeleton any later change can extend without restructuring: one app, one database, one way to run it.
- `docker compose up` starts the database and the app on a laptop. Developers can also run the database in a container and the app with `npm run dev` for hot reload.
- The same container image will later run on AWS without code changes.
- Every push is checked automatically: lint, types, unit tests, build and smoke tests.

**Non-Goals:**
- No sign-in, users, roles or business tables. Those come in `add-authentication-and-roles` and later changes.
- No AWS resources, no deployment pipeline and no domain. Hosting stays on the laptop for demos.
- No AI calls, embeddings, Excel or document processing.
- No UI component library yet. It's chosen with the first real screens (`add-estimation-request-wizard`).

## Decisions

### 1. One Next.js (App Router) app in TypeScript at the repository root
- Screens and API routes live in one app under `src/`. TypeScript runs in strict mode.
- **Why:** this is a small internal tool, so one deployable unit is the fastest to build and demo. React matches Folio3's skills. API routes cover the foreseeable backend needs (import, export, matching).
- **Alternatives:**
  - React + a separate NestJS API: cleaner separation, but two deployables, and too much for now. It can be split later if the backend grows.
  - Remix or Vite SPA + Express: no advantage over Next.js for this team.

### 2. Node.js 26 LTS everywhere
- The same major version runs locally (already installed), in the container image and in CI. `package.json` `engines` and `.nvmrc` pin it.
- **Why:** avoids "works on my machine" differences.

### 3. PostgreSQL 17 with pgvector, using the `pgvector/pgvector:pg17` image
- **Why:** relational data plus vector similarity search (needed later for F-04 and F-24) in one database. Amazon RDS for PostgreSQL supports pgvector, so the move to AWS is direct.
- **Alternatives:**
  - A separate vector database (Pinecone, OpenSearch): another service to run and pay for, with no benefit at this scale.

### 4. Prisma as ORM and migration tool
- The first migration is hand-written SQL: `CREATE EXTENSION IF NOT EXISTS vector;` plus one tiny `app_meta` table (key/value, e.g. schema label). This gives Prisma a model to generate a client for, and proves migrations run.
- **Why:** typed queries, readable schema, versioned migrations, and good Next.js support. Raw SQL is still possible for vector queries later.
- **Alternatives:**
  - Drizzle: lighter and closer to SQL, but fewer people at Folio3 know it, and its migration tooling is less mature.
  - Plain SQL: no type safety.

### 5. Configuration validated with zod, before the server starts
- `src/lib/env.ts` defines the schema:
  - `DATABASE_URL`: required, must be `postgres://` or `postgresql://`
  - `NODE_ENV`
  - `LOG_LEVEL`: optional, default `info`
- A small `scripts/check-env.ts` runs before `next start` (in `npm start` and the container's start command). It exits with code 1 and lists the bad setting names, never their values.
- The app code imports the same parsed config.
- **Why:** the spec requires refusing to start. Throwing from Next.js's instrumentation hook doesn't reliably stop the process, but a pre-start check does.
- **Alternatives:** `@t3-oss/env-nextjs`. It's fine, but adds a dependency for little gain at three variables.

### 6. Health check: `GET /api/health` (dynamic route, never cached)
- **Checks:**
  1. `SELECT 1`
  2. `SELECT 1 FROM pg_extension WHERE extname = 'vector'`
- Both run under one 3-second timeout (`Promise.race`).
- **Responses:**
  - **200** with `{ status, version, time, database: { status } }`
  - **503** with a generic `message` on failure
- The version comes from `package.json`.
- Errors are logged server-side with full detail and returned without it, as `system-health` requires.
- **Why:** this is what a load balancer or a person checking a demo needs. It stays unauthenticated because it reveals nothing sensitive.

### 7. Styling: Tailwind CSS with CSS variables for light and dark mode
- Colors are defined as CSS variables, switched by `prefers-color-scheme`. Layout is mobile-first.
- **Why:** fast to build screens, and it's what the component libraries most likely chosen later (e.g. shadcn/ui) build on.
- **Alternatives:**
  - CSS Modules: more hand-written CSS per screen.
  - MUI: heavy, and an early lock-in.

### 8. App shell: root layout, `not-found.tsx`, `error.tsx`, home page
- The header shows "F3 Estimation Tool" and "Folio3". The home page has the description and a "coming soon" notice.
- `error.tsx` shows a generic message and a retry button, and logs the error.
- **Why:** these are the App Router's built-in conventions for the `app-shell` requirements, so there's no custom routing.

### 9. Logging: a minimal JSON logger wrapper over `console`
- Writes one JSON line per event (`level`, `msg`, `time`, context), respecting `LOG_LEVEL`.
- **Why:** CloudWatch and similar tools parse JSON lines, and nothing more is needed yet.
- **Alternatives:** pino. It's better under load, but can be swapped in later behind the same wrapper.

### 10. Quality tooling
- **Tools:**
  - ESLint (Next.js config) and Prettier
  - `tsc --noEmit` for type checks
  - **Vitest** for unit tests: env validation, and the health handler with a mocked database
  - **Playwright** for smoke tests against a running app: home page, header, 404, the 375 px layout, dark mode, and the real `/api/health` with a database
- **Why:** unit tests cover logic quickly; a few end-to-end tests prove the specs' observable behavior.

### 11. Containers: multi-stage Dockerfile and `compose.yaml`
- **Base image:** `node:26-bookworm-slim`. Debian is used instead of Alpine to avoid Prisma OpenSSL issues.
- **Build:** Next.js `output: "standalone"` keeps the runtime image small. The image runs as a non-root user.
- **Start command:** check env → `prisma migrate deploy` → start.
- **Compose services:**
  - `db`: pgvector image, named volume, health check
  - `app`: depends on a healthy `db`
- **Developer flow:** `docker compose up -d db`, then `npm run dev`.
- **Demo flow:** `docker compose up --build`.
- **Why:** the same image will run on ECS Fargate later.

### 12. Container runtime on Windows: Rancher Desktop with the dockerd (moby) engine
- **Settings:** Kubernetes off (it isn't needed and saves memory), engine set to dockerd, so the standard `docker` and `docker compose` commands work unchanged.
- **Install:** `winget install SUSE.RancherDesktop` (needs admin rights and WSL 2). This is done by the product owner, or with their approval, as the first task.

### 13. CI: GitHub Actions on every push and pull request
- **Steps:**
  1. Start a `pgvector/pgvector:pg17` service container
  2. `npm ci`
  3. Generate the Prisma client and run migrations
  4. Lint
  5. Type check
  6. Unit tests
  7. Build
  8. Playwright smoke tests (Chromium only)
- **Why:** catches problems before merge; the database service makes the health tests real.

### 14. Keep client data out of git
- `.gitignore` covers:
  - `.env*` (except `.env.example`)
  - `/uploads/`, `/samples/` and `/local-data/`, for real estimates, SOWs and RFPs used in demos
  - build output, `node_modules`, and Playwright reports
- `.gitattributes` normalises line endings (LF in the repository) for Windows.
- The already-tracked `docs/templates/*.xlsx` and `data/*` stay tracked.

## Risks / Trade-offs

- [Rancher Desktop needs WSL 2 and admin rights, and uses several GB of memory] → Kubernetes is turned off. If installing isn't possible, the database can run on a hosted PostgreSQL with pgvector by changing only `DATABASE_URL`, with no code change.
- [Next.js and Prisma major upgrades can break things] → Exact versions are pinned in `package-lock.json`. Upgrades are their own small changes, and CI catches breakage.
- [Prisma engines on Node 26] → If an incompatibility shows up, pin the newest Prisma release that supports it, or fall back to Node 24 LTS in all three places (local, image, CI) together.
- [End-to-end tests are slower and can be flaky] → Only a handful of smoke tests, Chromium only, with retries in CI.
- [Health endpoint is public] → It returns only statuses and the version, which the spec enforces. A rate limit comes with the security work later.
- [One app for UI and API] → Fine at this size. API logic goes in `src/server/` modules, not inside route files, so it can be moved to a separate service later.

## Migration Plan

This is greenfield, so there's no data to migrate.
- **Merge:** `feature/setup-project-foundation` is merged into `main` once CI passes and the product owner has run the app locally.
- **Rollback:** revert the merge commit. Nothing outside the repository changes, except the locally installed Rancher Desktop.

## Open Questions

- **Brand assets:** is there a Folio3 logo file and brand colors the shell should use? Until then, it shows the Folio3 name as text with a neutral palette. Adding a logo later changes only the header.
