# authentication Specification

## Purpose

Makes sure only Folio3 staff can use the F3 Estimation Tool: people sign in with their Folio3 Google account, every page and API is protected, and sessions end cleanly.

## Requirements

### Requirement: Sign in with Google
The system SHALL let people sign in with Google from the sign-in page at `/sign-in`, which shows a single "Continue with Google" action and states that only `@folio3.com` accounts can sign in.

#### Scenario: Successful Folio3 sign-in
- **WHEN** a person completes Google sign-in with a verified `@folio3.com` account
- **THEN** a session is created
- **AND** they are taken to the page they originally requested, or to `/` if none

### Requirement: Only Folio3 accounts are accepted
The system MUST accept only Google accounts whose email is verified and ends with `@folio3.com`, and MUST NOT create a user record for any other account.

#### Scenario: Non-Folio3 Google account
- **WHEN** someone signs in with a Google account such as `someone@gmail.com`
- **THEN** sign-in is refused
- **AND** the sign-in page shows "Only @folio3.com accounts can sign in"
- **AND** no user record is stored for that account

#### Scenario: Unverified email
- **WHEN** Google reports the account's email as not verified
- **THEN** sign-in is refused with the same message

### Requirement: Pages and APIs require sign-in
Every page and API route SHALL require a signed-in session, except the sign-in page, the sign-in callback routes, static assets, and `GET /api/health`.

#### Scenario: Signed-out page visit
- **WHEN** a signed-out person opens a protected page such as `/settings/people`
- **THEN** they are redirected to `/sign-in`
- **AND** after signing in they return to `/settings/people`

#### Scenario: Signed-out API call
- **WHEN** a request without a valid session calls a protected API route
- **THEN** the response status is 401 with a JSON error and no data

#### Scenario: Health check stays public
- **WHEN** a signed-out client sends `GET /api/health`
- **THEN** the health check responds as before, without requiring sign-in

### Requirement: Session lifetime and sign-out
A session SHALL expire after 12 hours without activity, and people SHALL be able to sign out at any time, which ends the session immediately.

#### Scenario: Sign out
- **WHEN** a signed-in person chooses "Sign out"
- **THEN** their session ends
- **AND** they see the sign-in page
- **AND** going back to a protected page redirects to sign-in again

#### Scenario: Idle session expires
- **WHEN** a session has had no activity for more than 12 hours
- **THEN** the next request is treated as signed out

### Requirement: Session cookies are protected
Session cookies MUST be HTTP-only, `SameSite=Lax`, and `Secure` whenever the site is served over HTTPS, and session tokens MUST NOT appear in URLs or logs.

#### Scenario: Cookie flags
- **WHEN** a session cookie is set on an HTTPS deployment
- **THEN** it has the `HttpOnly`, `Secure` and `SameSite=Lax` attributes

### Requirement: Development sign-in is never available in production
An email-and-password sign-in for seeded test users SHALL exist only when the `AUTH_DEV_LOGIN` setting is `1` and the app is not running in production, and the system MUST refuse to start in production if `AUTH_DEV_LOGIN` is `1`.

#### Scenario: Development sign-in enabled locally
- **WHEN** the app runs in development with `AUTH_DEV_LOGIN=1`
- **THEN** the sign-in page also offers "Development sign-in" for seeded test users

#### Scenario: Production with development sign-in
- **WHEN** the app starts with `NODE_ENV=production` and `AUTH_DEV_LOGIN=1`
- **THEN** startup stops with a non-zero exit code
- **AND** the log names `AUTH_DEV_LOGIN` as invalid

#### Scenario: Development sign-in disabled
- **WHEN** `AUTH_DEV_LOGIN` is not `1`
- **THEN** the sign-in page shows only "Continue with Google"
- **AND** the email-and-password endpoints respond as not found
