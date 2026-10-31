# Tasks

## 1. Dependencies and settings

- [x] 1.1 Install Better Auth (exact version, 1.7.x) and `@fontsource-variable/plus-jakarta-sans`, approve any install scripts they need, and read Better Auth's bundled docs for Next.js App Router, the Prisma adapter, the Google provider, database hooks and email-and-password; verify `npm ci` from a clean `node_modules` succeeds and `npm ls better-auth` shows the pinned version
- [x] 1.2 Extend `src/lib/env-schema.ts` with `AUTH_SECRET` (≥ 32 chars), `AUTH_URL` (http/https URL), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (required in production, optional in development/test when `AUTH_DEV_LOGIN=1`), `ADMIN_EMAILS` (comma list, each `@folio3.com`) and `AUTH_DEV_LOGIN` (`0`/`1`, invalid with `NODE_ENV=production`); verify new unit tests cover each rule, including "dev login refused in production", and that no test output contains a secret value
- [x] 1.3 Update `.env.example`, `compose.yaml` and the CI workflow with safe local and test values (a development-only `AUTH_SECRET` marked as such, `AUTH_DEV_LOGIN=1` locally and in CI, `0` in the compose `app` service); verify `npm run check-env` passes with the example file and the container still starts with `docker compose up --build`

## 2. Database

- [x] 2.1 Add the Better Auth tables (`user`, `session`, `account`, `verification`) to `prisma/schema.prisma`, plus `Role` and `UserStatus` enums, `user.role` (nullable), `user.status` (default `ACTIVE`), `user.lastActiveAt`, and a `RoleInvitation` model (unique lowercased email, role, invitedById, createdAt); create the migration; verify `npm run db:deploy` applies it on a fresh database and `npm run db:migrate` reports no drift
- [x] 2.2 Add `prisma/seed.ts` and an `npm run db:seed` script that creates four dev users with fixed roles (`dev.estimator@`, `dev.techlead@`, `dev.architect@`, `dev.admin@folio3.com`) and one user without a role, only when `AUTH_DEV_LOGIN=1` and not in production; verify that running it twice is idempotent and that it refuses to run in production

## 3. Permissions and session helpers (`user-roles` spec)

- [x] 3.1 Implement `src/server/auth/permissions.ts` (`can(role, permission)` with `estimate.edit`, `estimate.approve`, `people.manage`, `settings.manage`); verify a unit test asserts the full role × permission matrix (approve only Tech Lead and Architect; manage only Admin; no role → nothing)
- [x] 3.2 Implement the first-sign-in role decision (Admin from `ADMIN_EMAILS`, otherwise a matching invitation, otherwise none; `ADMIN_EMAILS` never changes an existing role) and the domain/verified-email check as pure functions; verify unit tests cover every branch, including uppercase emails and a trailing-space `ADMIN_EMAILS` entry
- [x] 3.3 Implement `src/server/auth/session.ts` (`getCurrentUser`, `requireUser`, `requirePermission`) returning 401/403 for APIs and redirects for pages, plus a `next`-path sanitizer that only allows same-site relative paths; verify unit tests for the sanitizer (rejects `//evil.com`, `https://…`, `/\evil`) and for 401 vs 403 responses

## 4. Authentication (`authentication` spec)

- [x] 4.1 Configure Better Auth in `src/server/auth/auth.ts`: Prisma adapter, database sessions (12 h expiry, ~15 min refresh, cookie cache off), secure cookie attributes, Google provider with `hd=folio3.com`, hooks for the domain check (before user creation), the role decision (after user creation, consuming the invitation) and blocking `DEACTIVATED` users (before session creation), and email-and-password only when dev login is allowed; mount it at `/api/auth/[...all]`; verify an integration test signs in a dev user through the API and receives an HTTP-only session cookie
- [x] 4.2 Extend `src/proxy.ts` to redirect requests without a session cookie to `/sign-in?next=…` (API → 401 JSON), keeping `/sign-in`, `/api/auth/*`, `/api/health`, static files and the test-route rule; verify unit tests of the path matcher and that `curl` to `/api/health` while signed out still returns 200
- [x] 4.3 Build `/sign-in` from the approved design ("Continue with Google", the `@folio3.com` notice, error messages for `domain` and `deactivated`, and the "Development sign-in" form only when enabled); verify it renders correctly at 375 px and desktop, in light and dark mode, and that the dev form is absent when `AUTH_DEV_LOGIN=0`

## 5. App shell (`app-shell` spec delta)

- [x] 5.1 Move the brand tokens and Plus Jakarta Sans from `docs/design` into `src/app/globals.css` (light and dark), with a "folio3" text wordmark in brand red; verify the existing light/dark e2e checks are updated and pass
- [x] 5.2 Create the `(app)` route group whose layout calls `requireUser()`, with the sidebar (filtered with `can()`, collapsing behind a menu button under 820 px) and the top bar (person's name, role and "Sign out"); move the home placeholder into it; verify e2e: signed out `/` redirects to `/sign-in`, the Estimator sees no Settings or Reviews, the Admin sees Settings, no horizontal scroll at 375 px
- [x] 5.3 Add the waiting-for-access page shown to signed-in people without a role (with sign-out) and make all other pages show it for them; verify e2e with the seeded no-role user, including that a protected API returns 403

## 6. People and roles (`user-roles` spec)

- [x] 6.1 Implement `src/server/people.ts` (`listPeople`, `setRole`, `invite`, `deactivate`, `reactivate`) with the `people.manage` check, the last-active-Admin rule (in a transaction), `@folio3.com`-only invites and session deletion on deactivate; verify integration tests against the test database for each behavior, including "last Admin cannot be demoted or deactivated" and "invited person gets the role on first sign-in"
- [x] 6.2 Build `/settings/people` from the approved design (table with role select, status, last active; Invite form; Deactivate/Reactivate with confirmation) using server actions, with clear error messages from the service; verify e2e as Admin: assign a role to the waiting user, then sign in as that user and see the app; deactivate them and confirm their next request is signed out
- [x] 6.3 Update `lastActiveAt` at most once per 15 minutes per user on authenticated requests; verify an integration test that it changes after the interval and not before

## 7. Tests, docs and CI

- [x] 7.1 Add a Playwright setup project that signs in once per role with dev sign-in and saves the storage state; update the existing app-shell tests to use it; verify `npm run test:e2e` passes locally with all old and new tests
- [x] 7.2 Update `README.md`: sign-in overview, roles table, new settings, how to create the Google OAuth client (Internal consent screen, redirect URI `…/api/auth/callback/google`), the first-Admin setup via `ADMIN_EMAILS`, and dev sign-in plus seeding; verify a reader can follow it to sign in locally with dev sign-in from a fresh clone
- [ ] 7.3 Ensure CI runs migrations, seed, unit and integration tests and e2e with `AUTH_DEV_LOGIN=1`; verify the workflow is green on the pull request

## 8. Google sign-in on a real client (manual, needs the OAuth client)

- [ ] 8.1 The product owner or Folio3 IT creates a Google OAuth client (Internal) for `http://localhost:3000` and puts the ID and secret in `.env`; verify manually: a `@folio3.com` account signs in and lands on the waiting page (or Admin if in `ADMIN_EMAILS`), a personal Gmail account is refused with "Only @folio3.com accounts can sign in", and sign-out works

## 9. Integration check

- [ ] 9.1 From a fresh clone: `docker compose up --build`, seed, sign in as each dev role and walk the spec scenarios (redirects, navigation per role, people management, deactivation, sign-out, phone width, dark mode); confirm CI is green and record the results in the pull request description

## Workflow follow-up

- Open a pull request from `feature/add-authentication-and-roles` and merge it after review and a green CI run.
- Archive the change with `/opsx:archive add-authentication-and-roles` (creates `openspec/specs/authentication` and `openspec/specs/user-roles`, updates `openspec/specs/app-shell`).
- Next change from the brief: `add-estimation-request-wizard` (F-02, F-03).
