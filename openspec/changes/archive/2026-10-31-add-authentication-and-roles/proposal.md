# Proposal

## Why

The tool will hold Folio3's past estimates, client SOWs and RFPs, rates and approvals. None of that may be visible to anyone outside Folio3, and the approval rule in the brief (F-10: only Tech Leads and Architects approve) needs to know who is signed in and what they may do. Every later feature depends on this, so sign-in and roles come right after the foundation (brief section 12, step 2; F-01).

## What Changes

- **Sign in with Google**, using people's Folio3 Google Workspace account. Only verified `@folio3.com` accounts are accepted; anyone else is refused with a clear message and no account is created.
- **Every page and API requires sign-in**, except the sign-in page itself and the health check (`/api/health`, unchanged). Signed-out visitors are sent to sign-in and returned to the page they wanted afterwards.
- **Sessions:** a signed-in session lasts up to 12 hours of inactivity; users can sign out from the header.
- **Four roles:** Estimator, Tech Lead, Architect, Admin (one per user). Tech Leads and Architects are the only roles that can approve (used by F-10 later). Admins manage people and settings.
- **First Admin bootstrap:** emails listed in the `ADMIN_EMAILS` setting become Admin on first sign-in, so the tool can be set up without database edits.
- **New users wait for a role:** a first-time `@folio3.com` user lands on a "waiting for access" page until an Admin assigns a role.
- **Settings → People and roles** (from `docs/design`): Admins see everyone, assign or change roles, pre-assign a role to a colleague's email before they sign in ("invite"), and deactivate or reactivate people. Deactivated people can't sign in and their existing sessions end; their past work is kept.
- **App shell updates:** the header shows the signed-in person (name, role) with a sign-out control, and the left sidebar from the approved design shows only the sections that person's role can use.
- **Local development and tests:** an email-and-password sign-in exists **only** when explicitly enabled outside production, with seeded test users per role, so developers and CI can sign in without Google.

Out of scope: estimation screens (Home dashboard content, wizard, workspace) beyond the shell and placeholder; audit log (F-20); multiple roles per person.

## Capabilities

### New Capabilities
- `authentication`: how people sign in (Google, `@folio3.com` only), how sessions work and end, which routes are public, and the development-only sign-in.
- `user-roles`: the four roles and what each may do, first-Admin bootstrap, the waiting-for-access state, and Admin management of people (assign, invite, deactivate).

### Modified Capabilities
- `app-shell`: the shared layout now shows the signed-in person and a sign-out control plus role-aware navigation; the home page now requires sign-in.

## Impact

- **Code:** sign-in page, auth API route, route protection (Next.js proxy), session helpers, role checks for server code and API routes, Settings → People and roles screen, updated layout (sidebar + header), waiting-for-access page.
- **Database:** new tables for users, sessions, linked accounts, verification, and role invitations (Prisma migration).
- **Dependencies:** Better Auth (sign-in library; see design.md for why not Auth.js), Google OAuth.
- **Configuration (new settings):** `AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`, `AUTH_DEV_LOGIN` (dev/test only). The startup settings check (system-health) validates them; no spec change there because it already requires valid configuration.
- **External setup:** a Google OAuth client for Folio3's Google Workspace must be created (by the product owner or Folio3 IT) before Google sign-in works on a shared environment; local development and CI work without it.
- **Existing tests:** end-to-end tests that open pages now sign in first using the development sign-in.
