# Design

## Context

What already exists:
- **Statuses:** the `RequestStatus` enum already has `DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `APPROVED` and `EXPORTED`. Every new request is `DRAFT`, and imports create `APPROVED`.
- **Editing:** `canEditRequest` (`src/server/estimation-requests.ts`) already allows edits only in `DRAFT` and `CHANGES_REQUESTED`, and `loadForEdit` refuses other statuses with "This request can no longer be edited". So the lock in the spec mostly exists already; what's missing is the transitions.
- **Permissions:** `estimate.approve` (Tech Lead and Architect) is in `src/server/auth/permissions.ts`, and the sidebar shows "Reviews" as "Soon" for those roles.
- **Checklist:** `buildChecklist` (`src/lib/estimation/checklist.ts`) produces the pre-export warnings. Its header says the review workflow can reuse it.
- **Estimate data:** `getEstimate` (`src/server/estimates.ts`) builds the full estimate view with totals through `computeTotals`. The export builds `ExportData` from the same data.
- **No email:** there's no mail setup, and the user chose in-app notifications for now.

## Goals / Non-Goals

**Goals:**
- the status transitions, enforced on the server and safe when two people act at once
- the review page, comments, the approved snapshot and the reopen flow
- the status history and in-app notifications
- the knowledge-base source rule, as one function F-04 can call
- the draft watermark on exports

**Non-Goals:**
- email
- the client-facing export
- the version comparison view (F-11)
- reassigning a review without withdrawing it
- AI-guess and override flags (F-04, F-05)

## Decisions

### 1. Data model (one migration `review_workflow`)

- **`EstimationRequest`** gains:
  - `version Int @default(1)`
  - `reviewerId String?` (relation to User, the assigned Approver while In review or Changes requested)
  - `submittedAt DateTime?`
- **`StatusChange`**: `id`, `requestId` (cascade), `fromStatus RequestStatus?`, `toStatus`, `version`, `actorId` (User, restrict delete), `comment String?`, `createdAt`. Index `(requestId, createdAt)`.
- **`ReviewComment`**: `id`, `requestId` (cascade), `authorId`, `version`, `body`, `createdAt`.
  - It targets a Task or Sub task through `taskId String?` and `subTaskId String?`, with `onDelete: SetNull`.
  - A `targetTitle String?` snapshot keeps the comment readable after `syncTasks` removes a Task.
- **`ApprovedVersion`**: `id`, `requestId` (cascade), `version`, `snapshot Json`, `approvedById`, `approvedAt`. Unique on `(requestId, version)`.
- **`Notification`**: `id`, `userId` (cascade), `requestId` (cascade), `kind` (enum `SUBMITTED`, `CHANGES_REQUESTED`, `APPROVED`), `actorId`, `readAt DateTime?`, `createdAt`. Index `(userId, readAt)`.

The migration can't create `ApprovedVersion` v1 for already-approved requests, because SQL can't build the snapshot. Instead, an idempotent script (`npm run backfill-approved`, also called from `prisma/seed.ts`) creates them for approved requests that have none. New imports write their snapshot on approval.

`reviewerId` stays set during Changes requested, so resubmitting preselects the same Approver. Withdrawing clears it.

### 2. Transition rules (`src/lib/review/transitions.ts`, pure)

- A table, `TRANSITIONS: Record<Action, { from: RequestStatus[]; to: RequestStatus }>`, plus `canAct(action, { actor, request })`. It returns `ok`, or the refusal message and status code.
- The request page's buttons and the server both use it, the same pattern as `can()`.
- Owner/Admin actions use `estimate.edit` plus ownership, or `estimate.edit-any`.
- Approver actions need `estimate.approve`, `actor.id === request.reviewerId` and `actor.id !== request.ownerId`.

The server applies a transition with a conditional update:

```ts
const { count } = await tx.estimationRequest.updateMany({
  where: { id, status: { in: rule.from } },
  data,
});
if (count === 0) throw new ServiceError("This request is no longer in review", 409);
```

The `StatusChange`, the notification and (for approve) the snapshot are written in the same transaction. Two Approvers, or approve racing withdraw, can't both win.

### 3. Snapshot (`src/lib/review/snapshot.ts`)

- `type ApprovedSnapshot = { version, projectName, clientName, overheads, hourlyRate, parts: [{ part, label, tasks: [{ title, research, subTasks: [{ title, min, max, comment, source? }] }] }], totals }`. Hours are in tenths, as stored.
- It's built from the same loader as `getEstimate`. `totals` comes from `computeTotals`, so the snapshot matches what the review page showed.
- `snapshotVersion: 1` is stored inside the JSON, so later shapes can be read.
- For imports, `approveProject` (`src/server/import/import.ts`) builds the snapshot from the request it just created, inside its transaction.

### 4. Knowledge-base sources

`knowledgeBaseSources(actor)` in `src/server/review.ts` returns, for each request, its latest `ApprovedVersion` (`DISTINCT ON (requestId) ORDER BY version DESC`), plus the request's id, origin, outcome and client.

F-04 will search these snapshots, never live request rows. That's how a reopened Draft v2 can't leak into matching.

### 5. Attention items (`src/lib/review/attention.ts`)

- `attentionItems(checklistInput)` maps `buildChecklist` output to review wording with counts and links: "1 Sub task has no hours" → `/estimates/[id]/estimate?part=…#task-…`.
- `min-over-max` blocks submit, so it never appears in a review.
- F-04 and F-05 will add the `ai-guess` and `large-override` codes here.

### 6. Server API (`src/server/review.ts`)

- **Actions:**
  - `submitForReview(actor, id, { reviewerId })`: checks completeness with the existing `missing` logic and min-over-max with `buildChecklist`
  - `withdraw`
  - `requestChanges(actor, id, { comment })`
  - `approve`
  - `reopen`
  - `addComment(actor, id, { body, taskId?, subTaskId? })`
- **Reads:**
  - `getReview(actor, id)`: summary, totals, attention items, Tasks with comments, history and `canApprove`
  - `listReviews(actor)`: waiting for me, oldest first, and reviewed by me in the last 30 days
  - `approverChoices(actor, id)`
  - `unreadNotifications(actor)`
  - `markRequestRead(actor, id)`
  - `reviewCount(actor)`, for the sidebar
- Every function checks access itself and throws `ServiceError`, like the other services.
- Server actions in `estimates/[id]/actions.ts` (or `review/actions.ts`) return `{ ok, message }` and call `refresh()`.

`notify()` is one internal function, the only place a notification is created. Email can be added there later.

### 7. Pages and UI

- **Request page** (`estimates/[id]/page.tsx`): a "Review" card.
  - It shows the status line ("Waiting for review by Ahmed · submitted 2 h ago", "Approved by Ahmed · v1") and the actions allowed by `canAct`: Submit for review (a dialog with an Approver `<select>`), Withdraw, Open review, and Edit as new version.
  - Below it, a "History" list.
  - Opening the page calls `markRequestRead`.
- **Review page** `estimates/[id]/review/page.tsx`:
  - a summary card (totals and parts), "Needs your attention", and the Task and Sub task table with comment threads
  - an overall comment box, and Approve / Request changes for the assigned Approver; Request changes opens a dialog whose comment is required
  - follows the prototype's review screen (`docs/design/prototype` "Review & approval")
- **Estimate editor:** a comment count and thread under each Task and Sub task (read-only list plus an add box when allowed). It stays read-only for hours while locked, as today.
- **`/reviews`** (`(app)/reviews/page.tsx`): approver roles only, using `requireRole` and `estimate.approve`. Two tables: Waiting for my review, and Recently reviewed.
- **Sidebar:** `navFor(role, { reviewCount })` turns "Reviews" into a link to `/reviews` with a count badge (text, not colour alone), and `nav.test.ts` is updated.
- **Home:** "Awaiting my review" (Approvers, when they have any) and "Updates" (unread notifications) cards, above the request list.

### 8. Draft watermark

- In `writeSummary`, when `data.status` isn't `APPROVED` or `EXPORTED`, write "DRAFT – not approved" in bold red into the first free cell at the top of the Summary.
  - B3 is planned, if the template leaves it empty; a test checks the template.
  - The same text goes into `ws.headerFooter.oddHeader`.
- `ExportData` gains `status`.
- The parser round-trip test checks that a watermarked export still parses with the same totals.

### 9. Testing

- **Unit:**
  - the transition table: every action × status × actor role
  - owner self-review refused
  - attention-item mapping
  - the snapshot builder against `computeTotals`
  - `navFor` with a count
- **Integration** (`review.int.test.ts`):
  - the full round (submit → request changes → edit → resubmit → approve → reopen → v2 Draft)
  - concurrent approve and withdraw (one 409)
  - edits refused while in review, including Admin
  - comment permissions
  - notifications created and marked read
  - `knowledgeBaseSources` excludes drafts and returns v1 after a reopen
  - import approval writes v1
  - the watermark present on a draft export and absent on an approved one
- **E2E** (`review.spec.ts`), using the seeded Estimator, Tech Lead and Architect:
  - submit to the Tech Lead, who sees Reviews 1, comments on a Sub task and requests changes
  - the Estimator sees the update on Home, edits and resubmits, and the Tech Lead approves
  - the request shows Approved and history; Edit as new version gives v2 Draft
  - the Estimator has no Reviews entry

## Risks / Trade-offs

- **Snapshot drift:** a snapshot is a JSON copy and won't follow later schema changes. `snapshotVersion` and the reader in `snapshot.ts` keep old snapshots readable.
- **No reassignment:** if an Approver is away, the owner withdraws and resubmits. That's simple, and the history records it.
- **Admins can't edit in review:** this is stricter than "Admin may edit any request", and it's what the brief's lock requires. Admins can still withdraw.
- **In-app only:** reviewers must open the tool to see work waiting. The sidebar count and Home card make it visible, and email is a later, contained addition in `notify()`.

## Migration Plan

1. Run migration `review_workflow` (additive; `version` defaults to 1).
2. Run the backfill: imported or already-approved requests without an `ApprovedVersion` get v1 from their current data, with a `StatusChange` "Approved (imported)" attributed to the import's approver. It's idempotent.
3. Seed: the sample "Field service app" (won, with actuals) becomes Approved v1 with history, and "Patient portal MVP" stays a Draft for the demo.

Rollback: the migration is additive. Reverting the code leaves the extra tables unused.

## Open Questions

- Which mail service to use for email notifications (a later change).
- Whether "Exported" should be set by the client-facing export (that change will decide).
