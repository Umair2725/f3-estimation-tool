# Tasks

## 1. Container runtime

- [x] 1.1 Install Rancher Desktop (`winget install SUSE.RancherDesktop`, with the product owner's approval; needs admin rights and WSL 2), set the engine to dockerd (moby) and turn Kubernetes off; verify `docker version` and `docker compose version` both print versions in a new terminal
- [x] 1.2 Pull and start a throwaway `pgvector/pgvector:pg17` container, run `CREATE EXTENSION vector;` in it, then remove it; verify the command succeeds, which proves the runtime and image work on this machine

## 2. Project scaffold

- [x] 2.1 Scaffold a Next.js (App Router, TypeScript strict, `src/` directory, Tailwind CSS, ESLint) app at the repository root without overwriting `docs/`, `data/`, `openspec/` or `.claude/`; verify `npm run dev` serves the default page on http://localhost:3000
- [x] 2.2 Pin Node.js 26 in `package.json` `engines` and `.nvmrc`, set `version` to `0.1.0`, add Prettier with a config and `format`/`format:check` scripts, and add a `typecheck` script (`tsc --noEmit`); verify `npm run lint`, `npm run typecheck` and `npm run format:check` all pass
- [x] 2.3 Add `.gitignore` entries (`.env*` except `.env.example`, `/uploads/`, `/samples/`, `/local-data/`, build and test output) and a `.gitattributes` that normalises line endings to LF; verify `git status` shows no build output and `git check-ignore uploads/x.xlsx samples/x.docx .env` lists all three

## 3. Configuration and logging

- [x] 3.1 Add Vitest with a `test` script and a first trivial test; verify `npm test` runs and passes
- [x] 3.2 Implement `src/lib/env.ts` (zod schema: `DATABASE_URL` required PostgreSQL URL, `NODE_ENV`, `LOG_LEVEL` default `info`) and `scripts/check-env.ts`, which exits with code 1 and lists invalid or missing setting names without values; verify unit tests cover missing, invalid and valid configuration and that no test output contains the secret value
- [x] 3.3 Implement the JSON line logger in `src/lib/logger.ts`, respecting `LOG_LEVEL`; verify unit tests check the output shape and level filtering
- [x] 3.4 Add `.env.example` documenting every setting, with safe local defaults and no secrets; verify that `npm run check-env` with a copy of it as `.env` passes, and fails after deleting `DATABASE_URL`

## 4. Database

- [x] 4.1 Add Prisma, a `schema.prisma` with the PostgreSQL datasource and an `AppMeta` model (key, value, updatedAt), and an initial migration whose SQL also runs `CREATE EXTENSION IF NOT EXISTS vector;`; verify `npx prisma migrate deploy` succeeds against the local database and `\dx` lists `vector`
- [x] 4.2 Add `src/server/db.ts` with a single shared Prisma client (safe for Next.js dev hot reload) and `db:migrate`, `db:deploy` and `db:studio` scripts; verify `npm run db:deploy` runs cleanly a second time (no pending migrations)

## 5. Health check (`system-health` spec)

- [x] 5.1 Implement the database and extension checks in `src/server/health.ts`, with a 3-second timeout and generic messages ("database unavailable", "required extension missing"), logging full errors server-side; verify unit tests with a mocked client cover ok, unreachable, timeout and missing extension, and assert that no raw error text reaches the result
- [x] 5.2 Implement `GET /api/health` as a dynamic, uncached route returning 200 or 503 with `status`, `version` (from `package.json`) and `time` (ISO 8601) and `database.status`; verify with the database running that `curl -i http://localhost:3000/api/health` returns 200 and `"status":"ok"`, and with the database stopped that it returns 503 and `"status":"error"`

## 6. App shell (`app-shell` spec)

- [x] 6.1 Build the root layout with a header ("F3 Estimation Tool", "Folio3"), the main content area, and CSS-variable colors for light and dark mode; verify the header appears on every page in both color schemes
- [x] 6.2 Build the home page (title, one-line purpose, "estimation features are coming soon" notice); verify it renders at `/`
- [x] 6.3 Add `not-found.tsx` ("Page not found" + link to `/`) and `error.tsx` ("Something went wrong" + "Try again", no error details shown, error logged); verify `/does-not-exist` returns 404 with the message, and that a temporary throwing test page shows the friendly error with no stack trace
- [x] 6.4 Add Playwright (Chromium) with smoke tests for: header and home content, 404 page and status, no horizontal scroll at 375 px, dark mode colors, and `/api/health` returning 200 with a database; verify `npm run test:e2e` passes locally

## 7. Containers and local run

- [x] 7.1 Write a multi-stage `Dockerfile` (`node:26-bookworm-slim`, Next.js standalone output, non-root user; start command runs check-env → `prisma migrate deploy` → server); verify `docker build .` succeeds and the image runs as a non-root user
- [x] 7.2 Write `compose.yaml` with `db` (pgvector image, named volume, health check, port 5432) and `app` (depends on a healthy db, port 3000, env from `.env`); verify that `docker compose up --build` from a clean clone serves the home page and a 200 health check, and that `docker compose up -d db` + `npm run dev` also works
- [x] 7.3 Verify the startup check end to end: running the app container without `DATABASE_URL` exits with a non-zero code and logs the missing setting name

## 8. CI

- [ ] 8.1 Add `.github/workflows/ci.yml` (on push and pull request: pgvector service container, `npm ci`, Prisma generate + migrate deploy, lint, typecheck, unit tests, build, Playwright smoke tests with retries; upload the Playwright report on failure); verify the workflow passes on GitHub for this branch

## 9. Documentation

- [x] 9.1 Write `README.md`: what the project is (linking `docs/product-brief.md`), prerequisites (Node 26, Rancher Desktop settings), the two ways to run it, all npm scripts, environment settings, how to run tests, and where demo data must live (`/samples/`, `/uploads/`, never committed); verify that following the README on a clean clone gets the app running with a 200 health check

## 10. Integration check

- [ ] 10.1 From a fresh clone of the branch, run `docker compose up --build`, open the home page in light and dark mode and at phone width, hit `/api/health` with the database up and down, and confirm CI is green; record the result in the change's pull request description

## Workflow follow-up

- Open a pull request from `feature/setup-project-foundation` to `main`, and merge it after the product owner has run the app locally.
- Archive the change with `/opsx:archive` after merging, which creates `openspec/specs/system-health` and `openspec/specs/app-shell`.
- Next change: `add-authentication-and-roles` (Google sign-in, `@folio3.com` only, roles).
