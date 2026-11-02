## MODIFIED Requirements

### Requirement: Invite by email
Admins SHALL be able to pre-assign a role to a `@folio3.com` email address before that person has signed in; the role is applied on their first sign-in. Saving an invitation SHALL also send the invited person an invitation email (specs/email-notifications); the invitation is saved even when the email cannot be sent, and the Admin is told so. Admins SHALL be able to Resend the email for a pending invitation.

#### Scenario: Invited person signs in
- **WHEN** an Admin invites `sara.a@folio3.com` as Tech Lead and Sara later signs in for the first time
- **THEN** Sara's role is Tech Lead without further Admin action

#### Scenario: Invite outside the domain
- **WHEN** an Admin tries to invite an email not ending in `@folio3.com`
- **THEN** the invitation is refused with "Only @folio3.com addresses can be invited"

#### Scenario: Invitation email could not be sent
- **WHEN** an Admin invites `sara.a@folio3.com` while email is not set up or the mail server fails
- **THEN** the invitation is saved and the Admin sees "Invitation saved. The email couldn't be sent, so share the sign-in link with them"

#### Scenario: Resend
- **WHEN** an Admin clicks Resend on Sara's pending invitation
- **THEN** a new invitation email is sent to Sara and the Admin sees "Invitation email sent"
