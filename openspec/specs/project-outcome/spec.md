# project-outcome Specification

## Purpose

Defines what happened to an estimated project after the estimate (Won and in delivery, Lost, or Delivered), who records it, and how a Delivered project's actual hours are locked.

## Requirements

### Requirement: Outcome values
Every estimation request SHALL have an outcome that is one of: none (the default), In delivery (won), Lost, or Delivered. A Lost outcome SHALL allow an optional reason of up to 500 characters.

#### Scenario: New request
- **WHEN** a request is created
- **THEN** its outcome is none

### Requirement: Who sets the outcome
The request's owner, Tech Leads, Architects and Admins SHALL be able to set the outcome of any request that has at least one Sub task with hours; other people SHALL be refused with 403, checked on the server. Allowed changes are: none → In delivery or Lost; In delivery → Delivered, Lost or none; Lost → In delivery or none. Changing a Delivered outcome SHALL be allowed to Admins only (reopen to In delivery).

#### Scenario: Mark won
- **WHEN** the owner marks a request with hours as Won
- **THEN** its outcome is In delivery and the request page offers "Actual hours"

#### Scenario: Request without hours
- **WHEN** someone tries to mark a request with no hours as Won
- **THEN** it is refused with "Estimate hours before recording an outcome"

#### Scenario: Estimator who isn't the owner
- **WHEN** an Estimator who doesn't own the request tries to change its outcome
- **THEN** the response is 403 and nothing changes

#### Scenario: Reopen a delivered project
- **WHEN** a Tech Lead tries to change a Delivered request's outcome
- **THEN** it is refused with "Only an Admin can reopen a delivered project"
- **AND** an Admin can reopen it to In delivery

### Requirement: Delivered locks actual hours
When a request is Delivered, its actual hours SHALL be locked: only Admins SHALL be able to save new actual-hour versions; everyone else sees them read-only with "Delivered: actual hours are final".

#### Scenario: Locked for a Tech Lead
- **WHEN** a Tech Lead opens the actual hours of a Delivered request
- **THEN** every field is read-only and saving or uploading is refused with 403

### Requirement: Outcome shown
The request page SHALL show the outcome (with the Lost reason) and the controls the viewer may use, and the home list SHALL show the outcome next to the status. The outcome SHALL NOT change the request's status (Draft, In review and so on).

#### Scenario: Outcome on home
- **WHEN** a request is In delivery
- **THEN** its home row shows "In delivery" next to its status
