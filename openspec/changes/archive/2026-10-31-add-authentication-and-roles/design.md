# Design

## Context

- Foundation is in place (archived change `2026-10-30-setup-project-foundation`): Next.js 16.4 App Router, React 19, Prisma 7.10 with `@prisma/adapter-pg`, PostgreSQL 17 + pgvector, zod settings check (`src/lib/env-schema.ts` + `scripts/check-env.ts`), JSON logger, `src/proxy.ts` (currently only hides the test route), Vitest, Playwright (6 smoke tests), Docker, CI.
- Approved UX: `docs/design/prototype/index.html` + `docs/design/README.md` (sign-in screen, left sidebar, top bar, Settings → People and roles, brand tokens: Plus Jakarta Sans, red `#F32735` / accessible `#D91E2B`, yellow `#FFCB11`).
- Folio3 uses **Google Workspace** (brief section 14). The brief named Auth.js; see Decision 1.
- Requirements: `specs/authentication`, `specs/user-roles`, `specs/app-shell` (delta).

## Goals / Non-Goals

**Goals:**
- Only verified `@folio3.com` Google accounts get in; everything else is private by default.
- Roles are enforced on the server in one place, ready for F-10 (approvals) to reuse.
- Deactivation takes effect immediately (no waiting for a token to expire).
- Developers and CI can sign in without Google or internet access to Google.
- The shell matches the approved design.

**Non-Goals:**
- Real estimation screens (only the placeholder home stays).
- Audit log of role changes (F-20, later), email notifications for invites, multiple roles per person.
- Fetching profile photos or Google groups.

## Decisions

### 1. Better Auth 1.7 instead of Auth.js
- **Why:** on 2026-10-30, Auth.js v5 (`next-auth@5`) is still `5.0.0-beta.32`; the stable `next-auth@4` predates the App Router patterns we use. Better Auth 1.7 is stable, actively released (last publish 2026-10-27), and officially supports Next 16 and Prisma 7 (peer dependencies checked). It keeps users and sessions **in our own PostgreSQL**, supports Google with database sessions, and has hooks for the domain rule, role bootstrap and blocking deactivated users.
- **Alternatives:** Auth.js v5 beta (beta risk for a company tool); Auth.js v4 (older API, weaker App Router support); hosted identity (Clerk, Auth0: data leaves Folio3, per-user cost); hand-written OAuth (security risk).
- **Note:** like Next.js, read the installed package's own docs before coding (`node_modules/better-auth`), as APIs move quickly.

### 2. Database sessions, not stateless tokens
- Sessions are rows in PostgreSQL referenced by an HTTP-only cookie. `expiresIn` = 12 h, refreshed on activity (`updateAge` ≈ 15 min), so an idle session dies after ~12 h.
- **Cookie cache off**, so every request sees the current session and user status: deactivating a person (which deletes their sessions) takes effect on their next request.
- **Alternative:** JWT sessions are faster but can't be revoked before they expire, which breaks the deactivation requirement.

### 3. Domain rule enforced on the server, hinted in Google
- The Google provider passes `hd=folio3.com` (Google only shows Folio3 accounts) **and** a server hook rejects any user whose email isn't verified or doesn't end with `@folio3.com` **before the user row is created**. `hd` alone is only a hint and can be bypassed.
- Rejections redirect to `/sign-in?error=domain` (or `deactivated`), shown as plain-language messages from the spec.
- Recommended for the OAuth client: Google consent screen user type **Internal**, which limits sign-in to the Workspace at Google's side as well.

### 4. Data model (Prisma migration)
- Better Auth core tables: `user`, `session`, `account`, `verification` (generated from Better Auth's Prisma schema output, then reviewed).
- `user` gets: `role` (nullable enum `Role { ESTIMATOR TECH_LEAD ARCHITECT ADMIN }`), `status` (enum `ACTIVE | DEACTIVATED`, default `ACTIVE`), `lastActiveAt`.
- New `role_invitation` table: `email` (unique, lowercased), `role`, `invitedById`, `createdAt`.
- One role per person (product decision; a nullable single column keeps checks simple). Multiple roles can be added later without breaking the API, because callers use permission checks, not role names (Decision 5).

### 5. One permission module, used everywhere
- `src/server/auth/permissions.ts`: a fixed map from permission to roles, for example `estimate.edit` → all four, `estimate.approve` → Tech Lead and Architect, `people.manage` and `settings.manage` → Admin. A function `can(role, permission)`.
- `src/server/auth/session.ts`: `getCurrentUser()`, `requireUser()` (401 or redirect), `requirePermission(p)` (403). Every route handler and server action calls one of these first. Navigation uses `can()` only to decide what to show.
- **Why:** a single source of truth for the brief's role rules, unit-testable without a browser.

### 6. Two layers of route protection
- **Proxy (fast, optimistic):** `src/proxy.ts` redirects requests that have no session cookie to `/sign-in?next=<path>` (API routes get 401 JSON). Public paths: `/sign-in`, `/api/auth/*`, `/api/health`, `/_next/*`, `/favicon.ico`, `/robots.txt`. The existing test-route rule stays.
- **Server (authoritative):** pages live in an `(app)` route group whose layout calls `requireUser()`. A user with no role sees the waiting page. API routes call `requirePermission()`.
- **Why:** the proxy avoids rendering protected pages for signed-out visitors; the server check is what actually guarantees access, because cookies can be forged or stale. The `next` parameter only accepts same-site relative paths (no open redirect).

### 7. First sign-in: bootstrap Admin, then invitations
- In the user-creation hook, after the domain check: if the email is in `ADMIN_EMAILS` → Admin; else if a `role_invitation` exists → that role, and the invitation is deleted; else no role (waiting page).
- On later sign-ins, `ADMIN_EMAILS` is applied only to people **without** a role, so removing an email never silently demotes anyone (spec scenario).
- The session-creation hook blocks `DEACTIVATED` users.

### 8. People management as a service plus a server-rendered page
- `src/server/people.ts`: `listPeople`, `setRole`, `invite`, `deactivate`, `reactivate`, each taking the acting user and checking `people.manage`.
- **Last-Admin rule:** `setRole` and `deactivate` count active Admins inside a transaction and refuse to remove the last one.
- `deactivate` sets the status and deletes all of that user's sessions in the same transaction.
- **UI:** `/settings/people`, following the prototype's table (name, email, role select, status, last active), plus an "Invite" form and Deactivate/Reactivate buttons. Changes use server actions with optimistic feedback and an error toast if the server refuses.

### 9. Settings (environment)
`src/lib/env-schema.ts` gains:

| Setting | Rule |
|---|---|
| `AUTH_SECRET` | Required, at least 32 characters |
| `AUTH_URL` | Required, an `http(s)` URL, for example `http://localhost:3000` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Required in production; optional in development and test when `AUTH_DEV_LOGIN=1` |
| `ADMIN_EMAILS` | Optional comma-separated list; every entry must end with `@folio3.com` |
| `AUTH_DEV_LOGIN` | `0` or `1`, default `0`; **invalid when `NODE_ENV=production`** |

`.env.example`, `compose.yaml` and CI are updated with safe local values (a fixed development `AUTH_SECRET` that is clearly marked as not for production).

### 10. Development and test sign-in
- Better Auth's email-and-password sign-in is enabled only when `AUTH_DEV_LOGIN=1` and not in production (the settings check also refuses that combination, so it can't be switched on in production by mistake).
- **Seeding:** `npm run db:seed` creates four test users with fixed roles (`dev.estimator@folio3.com`, `dev.techlead@folio3.com`, `dev.architect@folio3.com`, `dev.admin@folio3.com`; development-only password in `.env.example`), plus one user without a role.
- **Playwright:** a setup step signs in once per role and saves the browser state, so tests reuse it.

### 11. Shell and brand from the approved design
- Bring the design tokens from `docs/design` into `globals.css` (keeping the dark-mode tokens).
- **Plus Jakarta Sans** is self-hosted through the `@fontsource-variable/plus-jakarta-sans` package. This avoids build-time downloads (Docker, CI) and third-party font requests.
- The sidebar and top bar become `src/components/shell/*`. The header shows the person's name and role and "Sign out". Navigation items are filtered with `can()`. The sidebar collapses behind a menu button below 820 px.
- **Logo:** until the open logo question is answered, the shell uses a "folio3" text wordmark in brand red rather than linking an external image (no third-party requests from the app).

### 12. Testing
- **Unit (Vitest):**
  - the `can()` matrix
  - the settings rules (secret length, domain list, dev login refused in production)
  - the domain check
  - the first-sign-in role decision
  - the `next` redirect sanitizer
- **Integration (Vitest against the test database in CI and locally):** the people service. This covers the last-Admin rule, invite applied on first sign-in, deactivation deleting sessions, and 403 for non-Admins.
- **E2E (Playwright, dev sign-in):**
  - signed-out redirect and return
  - API 401 when signed out
  - the health check stays public
  - the waiting page for a user without a role
  - navigation per role (Estimator has no Settings or Reviews; Admin sees Settings)
  - an Estimator calling the people API gets 403
  - an Admin assigns a role and the person gets in
  - sign-out
  - phone-width menu
- The Google redirect itself is checked manually once a Google OAuth client exists (documented in the README).

## Risks / Trade-offs

- [Better Auth API changes between minor versions] → Pin the exact version; read its bundled docs at implementation; integration tests cover the hooks.
- [No Google OAuth client yet] → Development and CI use dev sign-in, so the work isn't blocked. Creating the client is a manual task for the product owner or IT (tasks group 1), with step-by-step instructions in the README.
- [Proxy check is cookie-only] → Accepted on purpose; the authoritative check is on the server (Decision 6).
- [Dev sign-in leaking into production] → Three safeguards: the settings check refuses it, the code path checks `NODE_ENV`, and an e2e test asserts the endpoints return 404 when disabled.
- [Single role per person] → Simple now. A later change can add multiple roles behind `can()` without touching callers.
- [Every request reads the session from the database] → Negligible at internal-tool scale; enables instant deactivation.

## Migration Plan

- New tables are created by a Prisma migration (`db:deploy`, run automatically on container start).
- Existing deployments have no users yet, so no data migration is needed.
- **Before the first shared deployment:** set `AUTH_SECRET`, `AUTH_URL`, the Google client settings and `ADMIN_EMAILS`.
- **Rollback:** revert the merge; the auth tables are left unused (dropping them is a separate, deliberate migration).

## Open Questions

- **Who creates the Google OAuth client** in Folio3's Google Cloud: the product owner, or Folio3 IT (Workspace admin rights may be needed for an "Internal" consent screen)? This doesn't change the code; only the setup task's owner.
- **Logo:** whether the official logo may be stored in the repository (open in `docs/design/README.md`); until then the text wordmark is used.
