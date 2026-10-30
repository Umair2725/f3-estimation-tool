# Proposal

## Why

The F3 Estimation Tool (see `docs/product-brief.md`) has a product brief but no code. Every later change, from sign-in and the request wizard to the Excel export, import, matching and benchmarks, needs the same base: an application skeleton, a database, a repeatable local setup and automated checks. Building that base once, first, keeps later changes small and lets internal demos start early on a laptop, with an easy move to Folio3 AWS later (brief section 17).

## What Changes

- Create a single **TypeScript web application** (Next.js, React) at the repository root, with a basic **app shell**: Folio3-branded layout, header, a placeholder home page, and friendly "not found" and error pages.
- Add **PostgreSQL with the pgvector extension** as the database, managed through an ORM with versioned **migrations**. The first migration only enables pgvector and creates a minimal metadata table; no business tables yet.
- Add a **health check** endpoint that reports whether the app and its database are working, for local checks, demos and later AWS load balancers.
- Add **validated configuration**: the app reads settings from environment variables, refuses to start with a clear message when a required one is missing or invalid, and ships a documented `.env.example` with no secrets.
- Add a **one-command local environment** (container compose file for the app and database) and a script path that also works without containers, plus a README explaining both.
- Add **quality tooling**: linting, formatting, type checking, a unit test runner with a first test, and a **CI workflow** on GitHub that runs these checks and a production build on every push and pull request.
- Make sure **client data never enters git**: ignore rules for local uploads, sample estimates, `.env` files and build output.

Out of scope here (later changes): sign-in and roles (F-01), all business data and screens (F-02 onward), AI calls, Excel processing, and any AWS deployment.

## Capabilities

### New Capabilities
- `system-health`: how the running system reports its own health and its database connection, and how it behaves when its configuration is missing or invalid.
- `app-shell`: the common page frame every screen lives in, including branding, the header, the home placeholder, and the not-found and error pages.

### Modified Capabilities
_None. There are no existing specs yet._

## Impact

- **New code:** a Next.js application at the repository root (`src/`), ORM schema and migrations, a health route, config validation, and tests.
- **New dependencies:** Node.js LTS, Next.js/React, an ORM (Prisma), PostgreSQL 17 with pgvector, ESLint/Prettier, Vitest, and GitHub Actions.
- **Developer machines:** a container runtime is needed for the one-command setup. Docker is **not installed** on the product owner's machine, and Docker Desktop needs a paid licence at companies of Folio3's size; see `design.md`, Open Questions.
- **Repository:** new top-level files (`package.json`, `compose.yaml`, `Dockerfile`, `.env.example`, `.github/workflows/ci.yml`, `README.md`). The existing `docs/` and `data/` folders are unchanged.
