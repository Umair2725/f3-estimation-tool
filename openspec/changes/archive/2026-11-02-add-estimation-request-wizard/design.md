# Design

## Context

- **Built by `add-authentication-and-roles`:**
  - sign-in, the four roles and `can()` (`estimate.edit` is granted to all four roles)
  - server helpers `getCurrentUser()` and `requireUser()`
  - the `(app)` route group with the sidebar shell
  - Settings → People and roles, which follows the pattern used here: a server service that checks permissions, server actions that call it, and a thin Admin-only API route
- **Stack:**
  - Next.js 16 App Router with `cacheComponents`; signed-in pages set `instant = false`
  - Prisma 7 on PostgreSQL 17
  - Vitest unit and integration projects
  - Playwright running against the production build with `NODE_ENV=test` and the development sign-in
- **Approved design:** `docs/design/prototype/index.html`, screens 2 (Home) and 3 (New request).
  - The wizard has 4 steps with a stepper, a "Request summary" side panel and a footer bar ("Draft saved automatically · …", Save & exit, Back, primary action).
  - Home has stat cards, "Continue where you left off", and a list with quick filters (All, Mine, In review, Approved).
- **Template mapping:** the brief maps the answers to the Excel Summary sheet (B2, C5–C7, rows 27–34). The export change (`add-lean-excel-export`) uses that mapping; this change only stores the answers in a form the export can read.

## Goals / Non-Goals

**Goals:**
- A data model the next changes extend without reshaping it:
  - workspace hours (F-04, F-05, F-24)
  - export (F-07)
  - review (F-10)
  - document extraction (F-09)
- Every permission check on the server, in one service, reusing `can()`.
- The wizard survives leaving mid-way: every step is saved to the database, never only in the browser.
- The home list stays fast with hundreds of requests.

**Non-Goals:**
- Real-time co-editing or locking: one owner edits at a time, and the last save wins.
- Hours, Tasks and Sub tasks. Features here are scope items (feature level). They become Tasks with Sub tasks and hours in the workspace change.
- Status changes. Only Draft is created; the other statuses are defined but unused.

## Decisions

### 1. Data model

New Prisma models (snake_case tables, like the auth change):

| Model | Key fields | Notes |
|---|---|---|
| `Client` | `id`, `name`, `nameKey` (unique; lowercased, trimmed, inner spaces collapsed), `createdAt` | Reused across requests; masking (F-14) is added later. |
| `EstimationRequest` | `id`, `projectName`, `clientId?`, `projectManager`, `projectDate` (date), `status` (enum `DRAFT, IN_REVIEW, CHANGES_REQUESTED, APPROVED, EXPORTED`, default `DRAFT`), `ownerId`, `lastStep` (1–4), `applicationTypes`, `operatingSystems`, `browsers` (string arrays), `considerations` (JSON, see Decision 2), `createdAt`, `updatedAt` | `ownerId` → `User` with `onDelete: Restrict`, because people are deactivated, never deleted. |
| `RequestPart` | `id`, `requestId` (cascade), `part` (enum `BACKEND, WEB_FRONTEND, ADMIN_PANEL, MOBILE, CLOUD_INFRA`), unique (`requestId`, `part`) | One per chosen part; each becomes a development sheet later. |
| `RequestPartTechnology` | `requestPartId` (cascade), `technologyId` (→ `Technology`, `onDelete: Restrict`) | Restrict keeps a used technology from being deleted (spec: "never deleted"). |
| `Technology` | `id`, `name`, `nameKey` (unique), `parts` (array of the part enum), `retiredAt?`, `createdAt` | Catalog entries. |
| `Feature` | `id`, `requestId` (cascade), `name`, `description?`, `parts` (array of the part enum), `position` (int), `createdAt`, `updatedAt` | Ordered list; extracted features (F-09) and Tasks (workspace) link to it later. |

- **Indexes:**
  - `EstimationRequest(updatedAt desc)`, plus `(ownerId, status)` for "My drafts"
  - a trigram index on `projectName` and `Client.name` for search (`pg_trgm`, enabled in the migration)
- **Why separate tables for parts and technologies:** the export needs one row per part, and the home filter needs to search by technology with a join. A JSON column would make both awkward.
- **Why fixed choices are arrays and JSON:** application types, OS, browsers and considerations are fixed lists that nothing else joins on, so they stay simple.
- **Alternative considered:** a single JSON document for the whole wizard. It is simpler to save, but filters, the export and later Tasks all need relational parts and features.

### 2. Fixed choices live in code; `considerations` is validated JSON
- `src/lib/estimation/options.ts` defines:
  - the parts and their labels ("Web/Frontend", …), application types, operating systems, browsers
  - hosting options, environments, app stores, compliance standards
  - the four NFR areas (accessibility, performance and load, security, documentation)
- A zod schema validates every step's input, server-side, with the same schema used in the form.
- `considerations` holds `{ hosting[], environments[], appStores[], compliance[], nfr: { accessibility?, performance?, security?, documentation? } (each { enabled, note }), other }`. It is versioned with a `v: 1` field so later changes can migrate it.
- **Why:** these lists change rarely and only with code (they map to template rows). The tech catalog is the only Admin-managed list (spec).

### 3. One service, server actions per step
- `src/server/estimation-requests.ts` exports:
  - `createRequest(actor, step1)`
  - `saveStep(actor, id, step, input)`
  - `getRequest(actor, id)`
  - `listRequests(actor, filters)`
  - `deleteRequest(actor, id)`
  - `checkCompleteness(request)`
- Every function first runs `checkAccess(actor, "estimate.edit")`. Edits also check that the actor is the owner or an Admin, and that the status is `DRAFT` or `CHANGES_REQUESTED`. Errors are a typed `RequestError` with a status code, like `PeopleError`.
- **Saving a step** is one transaction:
  - step 1 upserts the client by `nameKey`
  - step 2 replaces the parts and technologies; it rejects retired or wrong-part technologies unless they are already on the request (spec: retired stays), and removes deleted parts from features
  - step 3 writes `considerations`
  - step 4 replaces the features list in order
  - `lastStep` and `updatedAt` are updated as part of the save
- Server actions in `src/app/(app)/estimates/actions.ts` wrap the service and return `{ ok, message, savedAt }`.
- **Why replace-on-save per step:** each step is small (a few dozen rows at most), and replacing the whole step keeps the action simple and idempotent. A retried request can't double-insert.

### 4. Routes and pages
- `/` (Home):
  - a server component reads the filters from `searchParams` (`q`, `status`, `owner`, `client`, `tech`, `mine`, `page`)
  - it calls `listRequests`; the filter controls update the URL with `router.replace`, so filters are shareable (spec)
  - stat card: only "My drafts" in this change. The design's other cards (reviews, approved this month, knowledge base) arrive with the changes that create that data, so the page never shows made-up zeros.
- `/estimates/new`: step 1 form; saving creates the request and redirects to `/estimates/[id]/edit?step=2`.
- `/estimates/[id]/edit?step=N`:
  - one page with a client wizard component per step, the stepper, the summary side panel (hidden under 1024 px, with a "Summary" disclosure instead), and the footer bar
  - a non-owner is shown the request page with a notice instead (the server action also refuses)
- `/estimates/[id]`: the read-only request page with Edit and Delete draft (confirm dialog), shown only when allowed.
- `/settings/tech-stack`: the Admin catalog page; Settings gets a small tab bar (People and roles · Tech stack).
- **Sidebar:** "Estimates" links to `/` (the list lives on Home, per the design); "New estimation" stays the top action on Home.

### 5. Saving and the "Draft saved" indicator
- Each step is a form with local state. Next, Back, stepper clicks, Save & exit and Finish all call the step's save action first, then navigate.
- If the save fails (validation or permission), navigation stops and errors are shown next to the fields.
- The footer shows "Draft saved · <relative time>" from the action's `savedAt`, refreshed every 30 s on the client.
- A `beforeunload` warning appears only when the current step has unsaved changes.
- **Alternative considered:** autosave on every keystroke (debounced). It's more requests, needs conflict handling, and the spec only needs a save on step changes and exit. It can be added later.

### 6. Completeness check is a pure function
`checkCompleteness(request)` returns a list of `{ step, message }` items (no client; no parts; a part without a technology; no features). It is unit-tested and used by Finish. The export and the review workflow will reuse it.

### 7. Search and list query
- Search: `ILIKE '%q%'` on the project name and client name, backed by the trigram indexes.
- Technology filter: an `EXISTS` subquery through `RequestPart` and `RequestPartTechnology`.
- Pagination: offset with 25 rows per page; at Folio3's volume (hundreds of requests per year), offset is fine.
- Hours column: rendered as "–" (no hours model yet).
- **Alternative considered:** full-text search. That's overkill for names.

### 8. Tech stack catalog
- `src/server/tech-stack.ts`: `listTechnologies({ includeRetired })`, `addTechnology`, `updateTechnology`, `retireTechnology`, `restoreTechnology`. All of them require `settings.manage`.
- Starting catalog: inserted by the migration's SQL (idempotent, `ON CONFLICT (name_key) DO NOTHING`), so every environment, including production, has it without a seed step.
- The dev seed (`prisma/seed.ts`) adds three sample requests with made-up clients ("Northwind Clinics", "Contoso Logistics", "Fabrikam Energy"; the same fictional names as the prototype). No real client names.

### 9. Testing
- **Unit:**
  - the step zod schemas
  - `checkCompleteness`
  - client name normalization
  - filter parsing from `searchParams`
  - option labels
- **Integration (database):**
  - create, save each step, and the client reuse rule
  - part removal updating features
  - retired technology rules
  - owner and Admin edit rules, plus deletion (including 403 for a non-owner and for a person without a role)
  - list filters (Mine, status, owner, client, technology, search) and pagination
  - catalog Admin-only rules and the case-insensitive duplicate check
- **End-to-end (Playwright):**
  - an Estimator creates a request through all four steps, leaves after step 2, resumes from "Continue where you left off", and finishes
  - Finish lists what's missing
  - another Estimator can view but not edit
  - an Admin edits and deletes it
  - home filters through the URL
  - the Admin adds and retires a technology
  - phone width (375 px) for Home and the wizard

## Risks / Trade-offs

- [The wizard state grows when F-09 adds extracted features] → Features already have their own table with a position; extracted items will link to `Feature` rather than change the steps.
- [Two people editing the same draft: the owner and an Admin] → The last save wins per step. It's rare, and versions (F-11) come later. Accepted.
- [Arrays and JSON for fixed choices are harder to query] → Nothing filters on them today. If a later report needs to, add a column then.
- [`pg_trgm` extension availability on Folio3 AWS (RDS)] → `pg_trgm` is supported on Amazon RDS for PostgreSQL. The migration uses `CREATE EXTENSION IF NOT EXISTS`, like pgvector in the foundation.
- [Removing a part silently strips it from features] → The spec requires a warning that names the affected features before saving.
- [The "Hours" column shows "–" for a while] → Expected until the workspace change. The empty state explains it.

## Migration Plan

- **Rollout:** one Prisma migration (new enums, tables, indexes, the `pg_trgm` extension and the starting catalog rows). It is additive, so existing data is unaffected. `npm run db:deploy` applies it locally, in CI and in the container.
- **Rollback:** revert the code and leave the tables in place (unused). Dropping them is a manual follow-up only if needed.
