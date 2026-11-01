# Proposal

## Why

AI-suggested hours must never reach a client unreviewed. Only approved estimates should become sources for future matching (brief F-10).

Matching (F-04) comes next in the release order, and it may search only approved work. So the approval workflow has to exist first (brief section 11, step 8).

Today a request is a Draft, and it stays one. The statuses In review, Changes requested and Approved already exist in the database, and editing is already limited to Draft and Changes requested, but nothing moves a request between them.

## What Changes

- **Submit for review** (the owner, or an Admin):
  - from Draft or Changes requested, the owner picks an **Approver**: an active Tech Lead or Architect who isn't the owner
  - the request must be complete, and must have no Sub task whose Min is greater than its Max
  - status → **In review**, and the request is locked for editing
  - the owner can **withdraw** it back to Draft while it's waiting
- **Review page** for the assigned Approver, and read-only for everyone else:
  - totals and the parts included
  - **items needing attention** first: the existing pre-export checklist warnings, such as zero hours, Tasks without Sub tasks, a rate that isn't confirmed or approved, or another client's name
  - the full Task and Sub task list, with comments
  - "AI guess" and "large override" flags come with matching and the AI reduction (F-04, F-05), which will add to the same list
- **Comments:** on the request, a Task or a Sub task, by the Approver, the owner or an Admin. They're visible to everyone with a role, and each one records the version it was made on.
- **Request changes** (the assigned Approver only): needs a comment. Status → **Changes requested**, and the request is unlocked for the owner.
- **Approve** (the assigned Approver only):
  - status → **Approved**
  - a **frozen snapshot** of the estimate (parts, Tasks, Sub tasks, hours, overheads, totals) is stored as the approved version
  - no one can approve their own request, and only Tech Leads and Architects ever see the button
- **Edit an approved estimate** (the owner, or an Admin):
  - starts a **new version** (v2, v3…) as a Draft that needs approval again
  - the last approved snapshot stays the request's knowledge-base source until a newer version is approved
  - imported historical requests can't be reopened
- **Knowledge base rule:** only requests with an approved snapshot are sources for matching.
  - Historical imports get their snapshot when an Admin approves them.
  - A service function returns these sources for F-04.
- **History:** every status change records who made it, when, the version and any comment, and the request page shows it.
- **In-app notifications** (email later, once a mail service is chosen):
  - the Approver is notified on submit, and the owner on changes requested and on approve
  - a **Reviews** page lists what's waiting for each Approver, and the sidebar "Reviews" entry shows a count instead of "Soon"
  - Home shows "Awaiting my review" to Approvers and "Updates" to owners
- **Export watermark:** the Excel export stays available at any status, as today. Unless the estimate is Approved, its Summary sheet says **"DRAFT – not approved"**, and so does its printed header.

**Out of scope:**
- **email notifications:** the notification step is in one place, so email can be added there
- **the client-facing export**, enabled only for Approved estimates: it gets its own change
- **version comparison:** the versions list and diff view are F-11, Release 1.1
- **reassigning a review:** the owner withdraws and resubmits to someone else instead
- **AI-guess and override flags:** these come with F-04 and F-05

## Capabilities

### New Capabilities
- `estimate-review`:
  - submit, withdraw, request changes and approve, each with its permission and status rules
  - comments, the review page, approved versions and the reopen flow
  - status history, in-app review notifications, the knowledge-base source rule and the draft watermark on exports

### Modified Capabilities
- None. The editing lock and the export watermark build on rules from `estimation-requests` and `excel-export`, which aren't archived yet (their changes wait on manual checks). So they're specified in `estimate-review`.
  - The `user-roles` rule "only Tech Lead and Architect can approve" is unchanged, and this change enforces it.

## Impact

- **Prisma** (one migration):
  - `EstimationRequest` gains `version`, `reviewerId` and `submittedAt`
  - new models `StatusChange`, `ReviewComment`, `ApprovedVersion` and `Notification`
- **Server:** a new `src/server/review.ts` with submit, withdraw, requestChanges, approve, reopen, comments, getReview, listReviews, notifications and knowledgeBaseSources.
  - `estimation-requests.ts`: the request detail adds review info and history.
  - `import.ts`: approving an import also writes the snapshot.
  - `export`: adds the watermark when not Approved.
- **Pure logic:** `src/lib/review/` holds the transition rules, attention items (built on `buildChecklist`) and the snapshot shape.
- **UI:**
  - request page: the review panel and actions, history, and "Edit as new version"
  - a new `estimates/[id]/review` page, a new `/reviews` page, and Home cards
  - the sidebar Reviews entry becomes a link with a count, and the estimate editor gains comment threads
- **No new dependencies.**
