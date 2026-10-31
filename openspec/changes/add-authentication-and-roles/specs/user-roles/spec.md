# Spec Delta

## Purpose

Defines who can do what in the F3 Estimation Tool: the four roles, how the first Admin is set up, what new people see before they have a role, and how Admins manage people.

## ADDED Requirements

### Requirement: Four roles, one per person
Each person SHALL have at most one role: Estimator, Tech Lead, Architect, or Admin. All four roles can create and edit estimates; only Tech Lead and Architect can approve estimates; only Admin can manage people and settings.

#### Scenario: Approver roles
- **WHEN** the system checks whether a person may approve an estimate
- **THEN** it answers yes only for Tech Lead and Architect

#### Scenario: Admin-only actions
- **WHEN** an Estimator, Tech Lead or Architect calls an Admin-only API, such as changing someone's role
- **THEN** the response status is 403
- **AND** nothing changes

### Requirement: Permissions are checked on the server
Every protected API route and server action SHALL check the caller's role on the server; hiding a button in the interface MUST NOT be the only protection.

#### Scenario: Direct API call without permission
- **WHEN** a signed-in Estimator sends a request directly to the people-management API
- **THEN** the response status is 403

### Requirement: First Admin from configuration
People whose email is listed in the `ADMIN_EMAILS` setting (comma-separated) SHALL receive the Admin role when they sign in and have no role yet.

#### Scenario: Bootstrap admin
- **WHEN** `ADMIN_EMAILS` contains `khanumair@folio3.com` and that person signs in for the first time
- **THEN** their role is Admin

#### Scenario: Removing an email later
- **WHEN** an email is removed from `ADMIN_EMAILS` after that person became Admin
- **THEN** they keep the Admin role until an Admin changes it in the tool

### Requirement: Waiting for access
A signed-in person without a role SHALL see only a "waiting for access" page that explains an Admin must assign a role, and offers sign-out; all other pages and APIs MUST treat them as unauthorized.

#### Scenario: New person without a role
- **WHEN** a `@folio3.com` person who has no role and no invitation signs in
- **THEN** they see the waiting-for-access page
- **AND** opening any other page shows the same page
- **AND** protected API calls respond with 403

### Requirement: Admins assign and change roles
Admins SHALL see a list of all people (name, email, role, status, last active) under Settings → People and roles, and SHALL be able to assign or change any person's role, with the change taking effect on that person's next request.

#### Scenario: Assign a role
- **WHEN** an Admin sets the role of a waiting person to Estimator
- **THEN** the list shows Estimator
- **AND** that person's next page load shows the normal app instead of the waiting page

#### Scenario: Last Admin protected
- **WHEN** an Admin tries to change the role of the only remaining active Admin, including themselves
- **THEN** the change is refused with "There must be at least one active Admin"

### Requirement: Invite by email
Admins SHALL be able to pre-assign a role to a `@folio3.com` email address before that person has signed in; the role is applied on their first sign-in.

#### Scenario: Invited person signs in
- **WHEN** an Admin invites `sara.a@folio3.com` as Tech Lead and Sara later signs in for the first time
- **THEN** Sara's role is Tech Lead without further Admin action

#### Scenario: Invite outside the domain
- **WHEN** an Admin tries to invite an email not ending in `@folio3.com`
- **THEN** the invitation is refused with "Only @folio3.com addresses can be invited"

### Requirement: Deactivate and reactivate people
Admins SHALL be able to deactivate and reactivate a person. A deactivated person MUST NOT be able to sign in, their existing sessions MUST end, and their past records MUST be kept.

#### Scenario: Deactivate
- **WHEN** an Admin deactivates a person who is currently signed in
- **THEN** that person's sessions end
- **AND** their next request is treated as signed out
- **AND** signing in again shows "Your access has been turned off. Contact an Admin."

#### Scenario: Reactivate
- **WHEN** an Admin reactivates that person
- **THEN** they can sign in again with their previous role
