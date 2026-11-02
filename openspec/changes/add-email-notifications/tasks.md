# Tasks

## 1. Settings and data model

- [x] 1.1 Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` to `src/lib/env-schema.ts`. When the host is set, the user, password and from address are required, and no value is ever printed. Document them in `.env.example`. Verify unit tests: not set up is valid, a host without a password names `SMTP_PASSWORD`, and the port and secure defaults.
- [x] 1.2 Add the `EmailKind` and `EmailStatus` enums and the `EmailMessage` model with its `(status, createdAt)` index. Generate the migration with `migrate diff`, then deploy it. Verify `db:deploy` on a fresh database, that there's no drift, and `prisma generate`.
- [x] 1.3 Install `nodemailer` (pinned to the latest release at least two weeks old: 10.1.7, which ships its own types). Verify that `npm.cmd ls nodemailer` shows the pinned version and the build passes.

## 2. Pure logic

- [x] 2.1 Move `updateText` and `updateLink` from the Home page to `src/lib/notifications/texts.ts` and import them on Home. Verify Home shows the same texts (existing e2e tests) and add unit tests for every kind.
- [x] 2.2 Implement `src/lib/email/templates.ts`: subject, text and HTML for all nine kinds, with absolute links from the base address, HTML-escaped values, and the comment or reason where the spec asks for it. Verify unit tests for the spec subjects, that `<script>` in a project name is escaped, and that the inputs have no hours.

## 3. Server

- [x] 3.1 Implement `src/server/email/`:
  - the transport built from settings, with timeouts and the `setMailTransportForTests` override
  - `queueEmail(tx, …)`: `NOT_SENT` when email isn't set up; skips inactive and non-`@folio3.com` recipients
  - `deliverQueued()` with the claim step, retries up to 3 attempts, and the stale `SENDING` rule
  - `deliverOne(id)` and `deliverQueuedSoftly()`
  - error messages shortened, with credentials removed

  Verify integration tests:
  - sent after commit, nothing after a rollback
  - a failure is recorded, the second attempt succeeds and the email isn't sent twice
  - gives up after 3 attempts
  - `NOT_SENT` when not set up
  - two parallel deliveries send each email once
- [x] 3.2 Make `notify()` queue the matching email, passing `detail` for changes requested and declined, from `review.ts` and `matching/matching.ts`. Verify extended integration tests: each of the six events queues one email to the right person with the right link, none goes to the actor, and none goes to a deactivated owner.
- [x] 3.3 People:
  - `invite()` queues `INVITATION` and returns its id
  - add `resendInvitation()`, for pending invitations only
  - `setRole` queues `ACCESS_GRANTED` only when a first role is given

  Verify integration tests: invite, resend, first role, a role change sends nothing, and inviting someone waiting for access sends `ACCESS_GRANTED`.

## 4. Pages

- [x] 4.1 The review, matching and people Server Actions call `after(deliverQueuedSoftly)`. The invite and Resend actions await `deliverOne` and show "Invitation saved. The email couldn't be sent, so share the sign-in link with them" or "Invitation email sent". Add the Resend button to pending invitations. Verify the e2e test: invite shows the could-not-send message (no SMTP in e2e), Resend is there, and the invitation is saved.
- [x] 4.2 Add Settings → Email (Admins only):
  - set-up state, host and from address, never the password
  - Send test email, disabled when not set up
  - the latest 50 emails with their status
  - Retry on failed ones
  - an `instant = false` layout

  Verify the e2e test: the Admin sees "Email isn't set up" and the "Not sent" rows for an invitation and its resend (submission emails are covered by integration tests), and a Tech Lead is refused.
- [x] 4.3 README: an "Email" section covering the settings, a Gmail app password step by step, the limits and the Email page. Verify that the README steps match the `.env.example` names.

## 5. Verification

- [ ] 5.1 Run lint, typecheck, unit, integration, e2e and the build, all green. Then on UAT with the product owner's Gmail app password in `.env`: Send test email arrives, and an invitation and a submit-for-review email arrive with working links.
- [ ] 5.2 Open a PR. Verify CI is green on the PR.

## Workflow follow-up

- Merge with the product owner's OK, then archive `add-email-notifications` (sync `email-notifications` new, `user-roles` and `estimate-review` modified) on a `chore/archive-…` branch.
