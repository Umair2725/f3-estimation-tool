# Tasks

## 1. Data model

- [x] 1.1 Add the Prisma enums (`RequestStatus`, `ProjectPart`) and models `Client`, `EstimationRequest`, `RequestPart`, `RequestPartTechnology`, `Technology`, `Feature` with the keys, cascades, `Restrict` rules and indexes from design Decision 1; create the migration, including `CREATE EXTENSION IF NOT EXISTS pg_trgm`, the trigram indexes and the starting catalog rows (`ON CONFLICT DO NOTHING`); verify `npm run db:deploy` applies it on a fresh database, `npm run db:migrate` reports no drift, and the catalog has the technologies listed in the tech-stack-catalog spec
- [x] 1.2 Add `src/lib/estimation/options.ts` (parts and labels, application types, operating systems, browsers, hosting, environments, app stores, compliance standards, NFR areas) and the zod schemas for the four steps and `considerations` (`v: 1`); verify unit tests for each schema, including "Enter a project name", "Choose at least one part" and rejection of unknown options
- [x] 1.3 Extend `prisma/seed.ts` with three sample requests using the prototype's fictional clients, owned by different dev users and in different steps; verify the seed stays idempotent and refuses to run in production

## 2. Tech stack catalog (`tech-stack-catalog` spec)

- [x] 2.1 Implement `src/server/tech-stack.ts` (list, add, update, retire, restore) requiring `settings.manage`, with case-insensitive unique names ("React is already in the catalog"); verify integration tests for each action, 403 for an Estimator, and that a technology used by a request can't be deleted
- [x] 2.2 Build `/settings/tech-stack` (a table by part with retired items marked, an add form, rename, part toggles, Retire and Restore) plus a Settings tab bar (People and roles · Tech stack); verify e2e as Admin: add "Svelte" for Web/Frontend, retire it, and see that the wizard no longer offers it

## 3. Request service (`estimation-requests` spec)

- [x] 3.1 Implement `src/server/estimation-requests.ts`: `createRequest`, `saveStep` (steps 1–4 as in design Decision 3, including client reuse by normalized name, replacing parts and technologies with the retired and wrong-part rules, removing deleted parts from features, and keeping features in order), `getRequest`, `deleteRequest`, with `RequestError`; verify integration tests for each step, client reuse ("northwind clinics " → existing), the part-removal effect on features, and the retired-technology rules
- [x] 3.2 Enforce the view, edit and delete rules (all roles view; owner or Admin edit while Draft or Changes requested; owner or Admin delete while Draft; no role → 403) inside the service; verify integration tests for an owner, another Estimator ("Only the owner or an Admin can edit this request"), an Admin editing without changing the owner, deleting a Draft that keeps the client, and a person without a role
- [x] 3.3 Implement `checkCompleteness(request)` as a pure function; verify unit tests for each missing item (client, parts, a part without a technology, features) and for a complete request
- [x] 3.4 Implement `listRequests(actor, filters)` with quick filters, search, the client, status, owner and technology filters, newest first and 25 rows per page, plus filter parsing from `searchParams`; verify unit tests for parsing and integration tests for each filter, their combination and pagination

## 4. Wizard (`estimation-requests` spec, design screen 3)

- [x] 4.1 Build the wizard frame: the stepper (clickable earlier steps), the footer bar ("Draft saved · …", Save & exit, Back, Next/Finish), the request summary side panel (a disclosure under 1024 px), save-before-navigate and the unsaved-changes warning; verify that Back, the stepper and Save & exit save first, and that a failed save keeps the person on the step with the errors shown
- [x] 4.2 Step 1 Project at `/estimates/new` (project name, client with suggestions from existing clients, project manager defaulting to the person's name, date defaulting to today); saving creates the Draft and goes to step 2; verify e2e for creation and "Enter a project name"
- [x] 4.3 Step 2 Platforms & stack (application types, operating systems, browsers, part toggles with technology pickers filtered by part and active status; a warning naming the features that lose a removed part); verify e2e for choosing parts and technologies, and the part-removal warning
- [x] 4.4 Step 3 Environment & compliance (hosting, environments, app stores, compliance, the four NFR areas with notes, other considerations); verify e2e that HIPAA and Security with a note appear on the request page
- [x] 4.5 Step 4 Requirements (add, edit, reorder with buttons that work from the keyboard, remove; name required; parts limited to the request's parts, "Choose at least one part"; the upload area shown as "Coming soon"), and Finish with the completeness list linking to steps; verify e2e for adding features, the missing-items list and finishing to the request page
- [x] 4.6 Edit route `/estimates/[id]/edit?step=N` opening the saved answers, with non-owners redirected to the request page with a notice; verify e2e: leave after step 2, reopen, and the answers are kept

## 5. Request page and home (`estimation-requests`, `home-screen` specs)

- [x] 5.1 Build `/estimates/[id]`: answers by step, features grouped by part, retired technologies marked "(retired)", owner, status badge, last updated, and Edit and Delete draft (with confirmation) only when allowed; verify e2e: another Estimator sees no Edit or Delete; the owner deletes and returns home
- [x] 5.2 Replace the home placeholder with the home screen: a greeting by first name, "New estimation request", the "My drafts" count, "Continue where you left off" (latest Draft at its last step, hidden with no Drafts), and the request list (project and client, status badge, owner, parts, hours "–", updated, open link), with empty and no-match states; verify e2e for resume-at-step and both empty states
- [x] 5.3 Add the home filters (quick filters All, Mine, In review, Approved; search; client, status, owner and technology filters; Clear filters; pagination), all kept in the URL; verify e2e: "Mine", search plus technology combined, and opening a shared filtered address
- [x] 5.4 Make the sidebar "Estimates" entry a working link to Home's list and update the nav unit tests; remove the old home placeholder e2e checks and update the app-shell e2e tests; verify `npm run test:e2e` passes, including no horizontal scroll at 375 px on Home, the wizard and the request page, and dark mode

## 6. Docs and CI

- [x] 6.1 Update `README.md` (what the tool does now, the request flow, Settings → Tech stack, sample data from the seed); verify a reader can create a request from a fresh clone with the dev sign-in
- [ ] 6.2 Verify CI (migrations, seed, unit, integration, e2e) is green on the pull request

## 7. Integration check

- [ ] 7.1 Walk the spec scenarios locally as an Estimator, another Estimator, a Tech Lead and an Admin (create, leave and resume, finish, view-only, Admin edit and delete, catalog change reflected in the wizard, filters through a shared URL, phone width, dark mode); record the results in the pull request description

## Workflow follow-up

- Archive `add-authentication-and-roles` before archiving this change (both touch the `app-shell` home page requirement).
- Open a pull request from `feature/add-estimation-request-wizard`, merge it after review and a green CI run, then archive with `/opsx:archive add-estimation-request-wizard`.
- Next change from the brief: `add-lean-excel-export` (F-07).
