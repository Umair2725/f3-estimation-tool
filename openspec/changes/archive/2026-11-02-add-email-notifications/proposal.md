# Proposal

## Why

People only learn about work waiting for them when they open the app:

- Inviting someone saves a role but tells them nothing, so the Admin has to send the link by hand.
- Someone on the "Waiting for access" page isn't told when they get a role.
- Approvers, owners and Architects see review and reference-hours updates only on Home.

The brief says the Approver is notified "in the app and by email" (F-10). We chose in-app first and email "once a mail service is chosen". Google sign-in now works, so people can act on a link in an email straight away. That makes this the right time.

## What Changes

- **Sending:**
  - standard SMTP, configured only in `.env`: host, port, user, password and the from address
  - for now a Google **app password** (a Folio3 Gmail account); later the company relay or Amazon SES, with no code change
  - with nothing configured, nothing is sent and the app works as today
- **Invitation email:** when an Admin invites a `@folio3.com` address, the person gets an email:
  - who invited them and the role
  - a **Sign in with Google** link to the sign-in page, with no token or password
  - Admins can **Resend** a pending invitation
- **Access granted email:** when someone who is waiting for access is given their first role, they're told they can now sign in.
- **Review and reference-hours emails:** each of the six existing in-app notifications is also emailed to the same person:
  - submitted for review
  - changes requested, including the comment
  - approved
  - reference hours requested
  - reference hours added
  - reference request declined, including the reason

  Each email links to the same page the Home update opens.
- **Reliability:**
  - emails are queued in the same database transaction as the action and sent after it commits, so a rolled-back action never sends an email
  - a failed send is retried, logged, and never undoes or blocks the action
  - deactivated people get no email
- **Email page for Admins** (Settings → Email):
  - shows whether email is set up and the from address; never the password
  - **Send test email** to yourself
  - the latest emails with their status: Sent, Failed with the reason, or Not sent because email isn't set up
  - Admins can retry failed ones
- **Out of scope:** per-person email preferences or unsubscribe, digests, emails for benchmark proposals, and email sign-in links.

## Capabilities

### New Capabilities
- `email-notifications`: sending email over SMTP from settings, the queue sent after commit with retries, the email for each event, links into the app, the Admin Email page with test email and status list, and behaviour when email isn't set up.

### Modified Capabilities
- `user-roles`: "Invite by email" also sends an invitation email, keeps the invitation when sending fails, and allows Resend. (The "access granted" email itself is specified in `email-notifications`.)
- `estimate-review`: "In-app review notifications" no longer excludes email. The same events are also emailed, as set out in `email-notifications`.

## Impact

- **Dependency:** `nodemailer` for SMTP.
- **Database:** a new `email_message` table, which is both the queue and the log, plus a migration.
- **Settings:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` in `src/lib/env-schema.ts`, `.env.example` and the README.
- **Code:**
  - `src/server/notify.ts` queues an email next to each in-app notification
  - `src/server/people.ts` (invite, resend, set role) queues the invitation and access emails
  - `review.ts` and `matching/matching.ts` deliver queued emails after their transactions
  - new `src/server/email/` (templates, queue, SMTP sender) and `src/lib/email/` (pure text builders)
  - Settings → Email page and the Resend button on the people page
- **Tests:** unit tests for the templates and settings checks, integration tests for the queue (sent after commit, never on rollback, retries, nothing when not set up), and an e2e test for the Admin Email page and Resend. Tests capture email instead of sending it.
