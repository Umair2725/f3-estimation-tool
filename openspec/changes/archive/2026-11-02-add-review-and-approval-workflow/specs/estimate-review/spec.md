# Spec Delta

## Purpose

Defines how an estimate is reviewed and approved before it reaches a client or the knowledge base: submitting to a Tech Lead or Architect, comments, requesting changes, approval with a frozen approved version, editing an approved estimate as a new version, status history, in-app notifications, the rule that only approved estimates are knowledge-base sources, and the draft watermark on exports.

## ADDED Requirements

### Requirement: Statuses and who may change them
A request's review status SHALL be one of Draft, In review, Changes requested, Approved or Exported, and SHALL change only through Submit for review, Withdraw, Request changes, Approve and Edit as new version, each specified below and checked on the server. Submit, Withdraw and Edit as new version SHALL be for the owner or an Admin; Request changes and Approve SHALL be for the assigned Approver only.

#### Scenario: Estimator calls approve directly
- **WHEN** an Estimator calls the approve action for a request in review
- **THEN** the response is 403 and the status stays In review

### Requirement: Refused and concurrent actions
A refused action SHALL change nothing and SHALL return 403, or 409 when the request is no longer in the status the action needs (for example, two reviewers acting at once). Exported is reserved for the client-facing export and SHALL be treated like Approved.

#### Scenario: Approving twice
- **WHEN** the assigned Approver approves a request that was withdrawn a moment earlier
- **THEN** the response is 409 with "This request is no longer in review" and nothing changes

### Requirement: Submit for review
The owner (or an Admin) SHALL submit a Draft or Changes requested request by choosing an Approver from the active people with the Tech Lead or Architect role, excluding the request's owner. Submitting SHALL be refused while the request has missing required details or any Sub task with Min greater than Max, with a message naming what to fix. Submitting SHALL record the Approver and the time, and set the status to In review. Imported historical requests SHALL NOT be submitted.

#### Scenario: Submit
- **WHEN** an Estimator submits a complete Draft to a Tech Lead
- **THEN** the status is In review, the Tech Lead is the assigned Approver, and the request page says "Waiting for review by <name>"

#### Scenario: Owner not offered as Approver
- **WHEN** a Tech Lead who owns a request opens the submit dialog
- **THEN** they are not in the Approver list, and submitting with their own id is refused with "You can't review your own request"

#### Scenario: Min greater than Max
- **WHEN** a request has a Sub task with Min 10 and Max 6
- **THEN** submitting is refused with "Fix the hours before submitting: 1 Sub task has Min greater than Max"

#### Scenario: Approver not eligible
- **WHEN** the chosen person is an Estimator, deactivated or has no role
- **THEN** submitting is refused with "Choose a Tech Lead or Architect"

### Requirement: Locked while in review or approved
While a request is In review, Approved or Exported, no one SHALL change its details, features, hours, overheads or rate, including Admins; it SHALL only be deleted while it is a Draft. Comments, the project outcome and actual hours SHALL stay available as before.

#### Scenario: Editing in review
- **WHEN** the owner saves a wizard step or a Sub task while the request is In review
- **THEN** the save is refused with "This request can no longer be edited" and the page shows the request read-only

### Requirement: Withdraw
While a request is In review, the owner or an Admin SHALL be able to withdraw it; the status SHALL return to Draft and the assignment SHALL be cleared. This is how a review is moved to another Approver.

#### Scenario: Withdraw and resubmit
- **WHEN** the owner withdraws a request in review and submits it to an Architect
- **THEN** the Architect is the assigned Approver and the earlier Approver can no longer approve it

### Requirement: Review page
The review page of a request SHALL show the project and client, who submitted it and when, the version, the total hours and the parts included, a list of items needing attention, and the full list of Tasks and Sub tasks with hours and comments. Everyone with a role SHALL be able to open it; only the assigned Approver SHALL see Approve and Request changes.

#### Scenario: Approver opens the review
- **WHEN** the assigned Approver opens a request in review with one Sub task at zero hours
- **THEN** the page lists "1 Sub task has no hours" under items needing attention, with a link to that Sub task, and shows Approve and Request changes

#### Scenario: Other people see the review read-only
- **WHEN** an Architect who is not the assigned Approver opens the same page
- **THEN** they see the review and comments but no Approve or Request changes button

### Requirement: Items needing attention
The review page's items needing attention SHALL include the pre-export checklist warnings: zero hours, Tasks without Sub tasks, features without hours, an unconfirmed or unapproved rate, and another client's name, each with a count and a link to where it is fixed.

#### Scenario: Unconfirmed rate
- **WHEN** a request in review uses a rate that was not confirmed
- **THEN** the items needing attention include the rate warning with a link to the overheads

### Requirement: Comments
The assigned Approver, the owner and Admins SHALL be able to comment on the request as a whole, on a Task or on a Sub task, while it is In review or Changes requested. A comment SHALL record its author, time and the request version. Everyone with a role SHALL see the comments. A comment on a Task or Sub task that is later removed SHALL stay visible on the request with the title it had.

#### Scenario: Comment on a Sub task
- **WHEN** the Approver comments "Seems high for a login screen" on the Sub task "User login"
- **THEN** the comment shows next to that Sub task on the review page and the estimate page, with the Approver's name and time

#### Scenario: Others cannot comment
- **WHEN** an Estimator who is not the owner posts a comment
- **THEN** it is refused with 403

### Requirement: Request changes
The assigned Approver SHALL be able to request changes only with a comment of at least one non-blank character; the comment SHALL be saved as a request comment and on the status history. The status SHALL become Changes requested, and the owner SHALL be able to edit and resubmit.

#### Scenario: Without a comment
- **WHEN** the Approver chooses Request changes with an empty comment
- **THEN** it is refused with "Add a comment saying what to change" and the status stays In review

#### Scenario: Owner edits after changes requested
- **WHEN** changes are requested and the owner edits a Sub task and submits again
- **THEN** the save succeeds and the status is In review again with the same Approver preselected

### Requirement: Approve
The assigned Approver SHALL be able to approve a request in review, unless they own it. Approving SHALL store a frozen approved version of the estimate: its version number, project details, parts with their Tasks and Sub tasks and hours, overheads, rate and totals, who approved it and when. Approve SHALL be offered only to people with the Tech Lead or Architect role.

#### Scenario: Approve
- **WHEN** the Tech Lead approves version 1
- **THEN** the status is Approved, the request page says "Approved by <name> · v1", and the approved version 1 is stored with the same totals the review page showed

#### Scenario: Own request
- **WHEN** a request owned by an Architect is somehow assigned to that Architect and they call approve
- **THEN** it is refused with "You can't approve your own request"

### Requirement: Edit an approved estimate as a new version
The owner or an Admin SHALL be able to choose "Edit as new version" on an Approved request. The request SHALL become a Draft with its version increased by one, and SHALL need approval again. The approved versions SHALL be kept unchanged. Imported historical requests SHALL NOT be reopened.

#### Scenario: Reopen
- **WHEN** the owner chooses Edit as new version on an approved v1
- **THEN** the request is a Draft v2, editable, and the page says "v1 approved by <name> on <date>"

#### Scenario: Imported request
- **WHEN** an Admin calls Edit as new version on an imported request
- **THEN** it is refused with "Imported projects can't be edited"

### Requirement: Knowledge-base sources
Only requests with at least one approved version SHALL be sources for matching, and the source SHALL be their latest approved version, not later unapproved edits. Drafts, requests in review and requests never approved SHALL never be sources. Approving an imported historical project SHALL store its approved version 1.

#### Scenario: Draft never a source
- **WHEN** the knowledge-base sources are listed
- **THEN** a Draft request that was never approved is not included

#### Scenario: Reopened request
- **WHEN** an approved v1 is reopened and its hours changed in Draft v2
- **THEN** the sources include the request with the v1 hours

### Requirement: Status history
Every status change SHALL record the person, the time, the from and to statuses, the version and any comment, and the request page SHALL show this history newest first. Imported projects SHALL show their import approval as the first entry.

#### Scenario: History after a round of changes
- **WHEN** a request is submitted, sent back with a comment, resubmitted and approved
- **THEN** the history lists four entries with names, times and the changes comment

### Requirement: In-app review notifications
The assigned Approver SHALL be notified in the app when a request is submitted to them; the owner SHALL be notified when changes are requested and when the request is approved. Home SHALL show "Awaiting my review" to Approvers with waiting requests, and the owner's unread updates. Opening the request SHALL mark its notifications read for that person. Email notifications are not part of this requirement.

#### Scenario: Owner sees changes requested
- **WHEN** the Approver requests changes
- **THEN** the owner's Home shows "Changes requested on <project> by <name>" until they open the request

### Requirement: Reviews page
People with the Tech Lead or Architect role SHALL have a Reviews page listing the requests waiting for their review, oldest first, and the requests they reviewed in the last 30 days; the sidebar Reviews entry SHALL link there and show how many are waiting.

#### Scenario: Approver sees the waiting request
- **WHEN** an Estimator submits a request to a Tech Lead
- **THEN** the Tech Lead's sidebar shows Reviews with 1, and the Reviews page lists the request with its submitter and time

#### Scenario: Estimators have no Reviews page
- **WHEN** an Estimator opens /reviews
- **THEN** the page says "You don't have access to this page", no request is listed, and the sidebar has no Reviews entry

### Requirement: Draft watermark on exports
The Excel export SHALL stay available at any status, as before. When the request is not Approved or Exported, the exported workbook's Summary sheet SHALL show "DRAFT – not approved" at the top and in its printed page header; an Approved export SHALL have no watermark. The watermark SHALL NOT change any totals or formulas.

#### Scenario: Draft export
- **WHEN** the owner exports a Draft
- **THEN** the Summary sheet shows "DRAFT – not approved" and the totals are the same as without it

#### Scenario: Approved export
- **WHEN** an approved request is exported
- **THEN** the workbook has no "DRAFT" text
