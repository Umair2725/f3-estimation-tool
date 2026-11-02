# Design

## Context

- **In-app notifications** are created only by `notify(tx, { userId, requestId, kind, actorId })` in `src/server/notify.ts`. It's called inside Prisma transactions:
  - three times in `src/server/review.ts`: submit, request changes, approve
  - three times in `src/server/matching/matching.ts`: ask, add reference, decline
  - it skips the person who acted
- **Home texts and links** for the six kinds are built by `updateText` and `updateLink` in `src/app/(app)/page.tsx`.
- **Invitations:**
  - `invite()` in `src/server/people.ts` upserts a `RoleInvitation`, or calls `setRole` when the person already exists
  - `setRole` runs in a transaction and knows the person's previous role
  - nothing is sent today
- **Settings:**
  - validated by zod in `src/lib/env-schema.ts`; a `superRefine` adds the rules between settings
  - `AUTH_URL` is the public address and is already required
- **Runtime:**
  - the app runs as a long-lived Node server: `next start` locally, the standalone Docker image later
  - Next 16's `after()` (`next/server`) runs a callback once a Server Function's response is finished
- **People:** the only addresses in the system are `@folio3.com` (policy in `src/server/auth/policy.ts`).
- **Mail account:** for UAT, the product owner will use a Google app password on a Folio3 Gmail account (`smtp.gmail.com`, port 465, TLS).

## Goals / Non-Goals

**Goals:**
- One SMTP sender driven by settings, so Gmail now and a relay or Amazon SES later needs no code change.
- An email is never sent for an action that didn't save, and a mail problem never breaks an action.
- Admins can see what was sent, what failed and why, send a test, and retry.
- The email texts and links match what Home shows.

**Non-Goals:**
- Per-person preferences, unsubscribe and digests.
- Emails for benchmark proposals and bounce handling.
- Email sign-in links.
- A background worker or cron job.

## Decisions

### 1. An outbox table that is both the queue and the log
- **The table:** a new `EmailMessage` (`email_message`) model with:
  - `id`
  - `kind` (enum `EmailKind`: `INVITATION`, `ACCESS_GRANTED`, `SUBMITTED`, `CHANGES_REQUESTED`, `APPROVED`, `REFERENCE_REQUESTED`, `REFERENCE_ADDED`, `REFERENCE_DECLINED`, `TEST`)
  - `to`, `subject`, `text`, `html`
  - optional `userId` and `requestId`
  - `status` (enum `EmailStatus`: `QUEUED`, `SENDING`, `SENT`, `FAILED`, `NOT_SENT`)
  - `attempts`, `lastError`, `sentAt`, `createdAt`
  - an index on `(status, createdAt)`
- **Queued with the action:** each row is written with the same transaction client as the action. If the action rolls back, the row disappears with it.
- **Not set up:** when email isn't set up, the row is written straight away as `NOT_SENT`, so Admins can still see what would have gone out.
- **Alternatives considered:**
  - Sending inside the transaction: a slow mail server would hold database locks, and a rollback after sending would still have sent the email.
  - Collecting emails in memory and sending after commit: a crash loses them, and nothing is left to show on the Email page.

### 2. Sending after the response with `after()`, plus a claim step
- **The sender:** `deliverQueued()` in `src/server/email/deliver.ts`.
- **Claiming rows:**
  - it claims up to 20 rows with one `UPDATE … SET status='SENDING' … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *`
  - claimable rows are `QUEUED`, `FAILED` with fewer than 3 attempts, and `SENDING` left for over 10 minutes (a crash mid-send)
  - two requests running at the same moment can't send the same email twice
- **Sending and recording:** each claimed row goes out through the transport. The row becomes `SENT` with `sentAt`, or `FAILED` with `attempts + 1` and `lastError`. The error message is shortened to 500 characters and has the password and user removed if present.
- **Who triggers it:**
  - the Server Actions that cause emails (review, matching, people) call `after(deliverQueuedSoftly)`
  - the services don't send, so integration tests call `deliverQueued()` directly
  - `deliverQueuedSoftly` logs and swallows every error
- **Retries:** a failed email is retried on the next run of any action that triggers delivery, which matches "retried on the next sending attempt". There's no cron in this change.
- **Synchronous exceptions:** the invitation, Resend and Send test email actions need to tell the Admin whether the email went out. So they await delivery of their one row through `deliverOne(id)`, with the same claim and record steps, instead of using `after()`.

### 3. Transport
- **Library:** `nodemailer`, pinned to the latest release that is at least two weeks old when it's installed, (10.1.7 ships its own types, so no `@types` package).
- **Created once:** `createTransport({ host, port, secure, auth: { user, pass } })` with 10-second connection, greeting and socket timeouts.
- **From:** `"F3 Estimation Tool" <MAIL_FROM>`.
- **Tests:** `setMailTransportForTests(fake | null)` swaps in a fake that captures messages or throws on demand, like `setGuessClientForTests`. The e2e server runs with no SMTP host, so every email there is `NOT_SENT`.

### 4. Settings
- **New settings in `env-schema.ts`:**
  - `SMTP_HOST` (optional text)
  - `SMTP_PORT` (default `465`)
  - `SMTP_SECURE` (`"true"`/`"false"`, default `true` when the port is 465)
  - `SMTP_USER` and `SMTP_PASSWORD` (optional text)
  - `MAIL_FROM` (an email address)
- **Rule:** when `SMTP_HOST` is set, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` are required (spec: Incomplete settings). As with other settings, the check names the setting and never prints its value.
- **Set-up check:** `emailConfigured()` returns true only when the host is set. `.env.example` and the README document Gmail (`smtp.gmail.com`, 465, an app password) and note the daily sending limits.

### 5. Pure templates shared with Home
- **Shared texts and links:** `updateText` and `updateLink` move from `page.tsx` to `src/lib/notifications/texts.ts`, and Home imports them, so the in-app and email wording can't drift apart.
- **The builders:** `src/lib/email/templates.ts` builds `{ subject, text, html }` for each `EmailKind` from plain data:
  - names, project name, role label
  - the comment or reason
  - the absolute link, which is `AUTH_URL` plus the path
- **HTML:** a single-column layout with inline styles and a button. Every value is HTML-escaped, and the text version is always included.
- **No figures:** the builders take no hours, rates or totals, so emails can't leak them (spec).

### 6. Hooking into existing flows
- **`notify()`:**
  - gains an optional `detail` (the comment or reason)
  - after creating the `Notification`, it loads the recipient (email, `isActive`), the actor's name and the project name through `tx`
  - it queues the email unless the recipient is inactive or not `@folio3.com`
  - callers pass `detail` for changes requested and declined
- **Invitations:**
  - `invite()` writes the invitation and queues an `INVITATION` email in one transaction, then returns `{ outcome, emailId }`
  - the action awaits `deliverOne(emailId)` and chooses its message from the result
  - when someone with a role already exists, it updates the role as today
  - `resendInvitation(actor, email)` checks the invitation is still pending, then queues and delivers a new `INVITATION` email
- **First role:** `setRole` queues `ACCESS_GRANTED` when the person's previous role was `null` and the new one isn't, in the same transaction. A role change from one role to another sends nothing.
- **Inviting someone already waiting:** `invite()` for an existing person with no role goes through `setRole`, so they get `ACCESS_GRANTED`.

### 7. The Email page
- **Where:** `src/app/(app)/settings/email/` as a new settings tab, guarded by `settings.manage` like the others.
- **What it shows:**
  - the set-up state, host and from address
  - Send test email, disabled when email isn't set up
  - the latest 50 rows: recipient, subject, kind, status, attempts, last reason, time
  - Retry on `FAILED` rows, which sets the row back to `QUEUED` with attempts reset and calls `deliverOne`
- **Layout:** the page reads the database on every request, so it gets an `instant = false` layout like the other dynamic route groups.

## Risks / Trade-offs

- **The Gmail account is a single point of failure:**
  - a changed password or a revoked app password stops all email
  - mitigation: the Email page shows the failures and the test button makes it quick to check
  - Gmail also limits sending (about 500 a day for a personal account, 2,000 for Workspace), which is far above our expected volume
- **No background retry:**
  - a failed email waits until the next action or an Admin clicks Retry
  - acceptable at our volume; a scheduled retry can come with the AWS deployment
- **`after()` and a crash:**
  - if the process dies between commit and send, the row stays `QUEUED` or `SENDING` and is picked up by the next run, the stale-`SENDING` rule covering a crash mid-send
  - a crash after SMTP accepted the message but before the row is marked could send that email twice; this is rare and harmless
- **Emails hold names and project names:** that's acceptable inside Folio3. The rows keep the full text for the Admin log, so a clean-up after 90 days may be needed later (not in this change).
- **Spam folders:** sending through Gmail from a Folio3 address passes Google's own checks. With a different relay, SPF and DKIM are IT's job.
