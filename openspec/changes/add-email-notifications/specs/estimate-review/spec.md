## MODIFIED Requirements

### Requirement: In-app review notifications
The assigned Approver SHALL be notified in the app when a request is submitted to them; the owner SHALL be notified when changes are requested and when the request is approved. Home SHALL show "Awaiting my review" to Approvers with waiting requests, and the owner's unread updates. Opening the request SHALL mark its notifications read for that person. Each of these notifications SHALL also be emailed to the same person as set out in specs/email-notifications; the in-app notification SHALL appear whether or not the email is sent.

#### Scenario: Owner sees changes requested
- **WHEN** the Approver requests changes
- **THEN** the owner's Home shows "Changes requested on <project> by <name>" until they open the request, and the owner is emailed the same update with the comment
