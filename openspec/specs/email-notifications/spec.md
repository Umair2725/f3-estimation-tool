# email-notifications Specification

## Purpose
Defines the emails the tool sends: the SMTP settings, emails saved with the action that causes them and sent after it, retries, who receives which email, the invitation, access and review-update emails, and the Admin Email page.

## Requirements

### Requirement: Email settings
The tool SHALL send email over SMTP using the host, port, security mode, user, password and from address in its settings. Email SHALL be set up only when the host and the from address are set; when the host is set, the from address, user and password SHALL be required, or the tool refuses to start and names the missing setting. The password SHALL never be shown in the app, written to logs or included in error messages.

#### Scenario: Not set up
- **WHEN** no SMTP host is set
- **THEN** the tool starts, every action works as before, and no email is sent

#### Scenario: Incomplete settings
- **WHEN** the SMTP host is set but the password is empty
- **THEN** the tool refuses to start and names `SMTP_PASSWORD` without printing any value

### Requirement: Emails are sent only after the action is saved
An email SHALL be recorded in the same save as the action that causes it, and sent only after that save succeeds. An action that fails or is undone SHALL send no email. A failure to send SHALL never undo, block or delay the action beyond the attempt itself; the person acting SHALL see the same result as without email.

#### Scenario: Action rolled back
- **WHEN** an approval fails after its notification was prepared
- **THEN** no approval email is recorded or sent

#### Scenario: Mail server down
- **WHEN** the Approver approves a request while the mail server refuses connections
- **THEN** the request is Approved, the owner's in-app update appears, and the email is recorded as Failed with the reason

### Requirement: Failed emails are retried
A failed email SHALL be retried automatically on the next sending attempt, up to three attempts in total, and then stay Failed with the last reason. An Admin SHALL be able to retry a Failed email. Each email SHALL record its status (Queued, Sent, Failed or Not sent), attempts, last reason and when it was sent.

#### Scenario: Recovers on retry
- **WHEN** the first attempt fails and the next sending attempt succeeds
- **THEN** the email is Sent with two attempts recorded and is not sent twice

#### Scenario: Gives up
- **WHEN** three attempts have failed
- **THEN** the email stays Failed with the last reason and is not retried until an Admin clicks Retry

### Requirement: Who receives an email
Each email SHALL go only to the one person it is about, at their `@folio3.com` address. No email SHALL be sent to the person who caused it, to a deactivated person, or to any address outside `@folio3.com`. When email is not set up, the email SHALL be recorded as "Not sent" so an Admin can see what would have gone out.

#### Scenario: Deactivated owner
- **WHEN** an Approver approves a request whose owner has been deactivated
- **THEN** no email is sent to the owner

#### Scenario: Not set up is visible
- **WHEN** an estimator submits a request while email is not set up
- **THEN** the Email page lists the submission email to the Approver as "Not sent, email isn't set up"

### Requirement: Review and reference-hours emails
Each in-app review and reference-hours notification SHALL also be emailed to the same person, with a subject naming the project and who acted, and a button linking to the page the Home update opens. Changes requested SHALL include the comment and a declined reference request SHALL include the reason. Emails SHALL NOT contain hours, rates, totals or client documents.

#### Scenario: Submitted
- **WHEN** Dev Estimator submits "Field service app" to Dev Tech Lead
- **THEN** Dev Tech Lead gets "Dev Estimator submitted Field service app for your review" with a link to its review page

#### Scenario: Changes requested
- **WHEN** Dev Tech Lead requests changes with "Split the sync Task"
- **THEN** Dev Estimator gets "Changes requested on Field service app by Dev Tech Lead" quoting "Split the sync Task" and linking to the request

#### Scenario: Reference declined
- **WHEN** Dev Architect declines a reference request with "Too vague, needs the client's sync rules"
- **THEN** the person who asked gets an email with that reason and a link to the request's Estimate tab

### Requirement: Invitation and access emails
An invitation SHALL email the invited address with who invited them, the role, and a Sign in with Google link to the tool's sign-in page; the link SHALL carry no token, so forwarding it gives no access. Giving a person their first role SHALL email them that they can now sign in. Changing an existing role SHALL send no email.

#### Scenario: Invited
- **WHEN** Dev Admin invites `sara.a@folio3.com` as Tech Lead
- **THEN** Sara gets "Dev Admin invited you to the F3 Estimation Tool as Tech Lead" with a Sign in with Google link

#### Scenario: Access granted
- **WHEN** Dev Admin gives Dev Newcomer, who is waiting for access, the Estimator role
- **THEN** Dev Newcomer gets "You now have access to the F3 Estimation Tool as Estimator" with a sign-in link

#### Scenario: Role changed
- **WHEN** Dev Admin changes Dev Estimator to Tech Lead
- **THEN** no email is sent

### Requirement: Email page for Admins
Admins SHALL have an Email page under Settings showing whether email is set up, the from address and server host (never the password), a Send test email button that emails the Admin, and the latest 50 emails with recipient, subject, status, attempts, last reason and time. Failed emails SHALL have a Retry button. Other roles SHALL NOT see the page.

#### Scenario: Test email
- **WHEN** Dev Admin clicks Send test email with email set up
- **THEN** a test email is sent to Dev Admin and the page shows "Test email sent to dev.admin@folio3.com"

#### Scenario: Test when not set up
- **WHEN** Dev Admin opens the Email page with no SMTP host
- **THEN** it shows "Email isn't set up" with the settings to add, and Send test email is disabled

#### Scenario: Not an Admin
- **WHEN** Dev Tech Lead opens the Email page
- **THEN** access is refused like other Admin settings
