# Proposal

## Why

People can now sign in, but the tool can't hold an estimate yet. Every later feature (Excel export, matching, review, actual hours) needs an estimation request to work on: its project, client, platforms, tech stack per part, environment, compliance and feature list. These answers also fill the Summary sheet of Folio3's Excel template. This is step 3 in the brief's order (section 12), covering F-02 (Home screen) and F-03 (Create an estimation request).

## What Changes

- **Home screen** (F-02, approved design screen 2) replaces the placeholder:
  - a "New estimation request" button
  - a "My drafts" count and a "Continue where you left off" card for your most recently edited draft
  - a list of all requests: project, client, owner, status, parts, hours (min–max), last updated
  - quick filters (All, Mine, In review, Approved), a search box (project or client), and filters by client, status, owner and tech stack
- **New estimation request wizard** (F-03, approved design screen 3): four steps, following the approved design (the brief's six steps, grouped).
  1. **Project:** project name, client, project manager, date
  2. **Platforms & stack:** application types, operating systems, browsers, and the parts the project needs (Backend, Web/Frontend, Admin Panel, Mobile, Cloud/Infrastructure), each with technologies from the catalog
  3. **Environment & compliance:** hosting and environments, app store publishing, compliance (HIPAA, GDPR, SOC 2, PCI-DSS), accessibility, performance and load, security, documentation, and other custom considerations
  4. **Requirements:** the feature list, entered by hand (name, short description, the parts it touches)
- **Drafts:**
  - a request is saved as a **Draft** at every step ("Draft saved · just now"); only the project name is needed to start
  - **Save & exit**, **Back** and a clickable stepper let people leave and come back
  - **Finish** checks that the request is complete (client, at least one part, at least one feature), then opens the request page
- **Request page:** a read-only summary of every answer and the features grouped by part. The owner (or an Admin) can edit or delete the draft; everyone else can view it.
- **Tech stack catalog** (Admin, Settings → Tech stack):
  - Admins add technologies, choose which parts each applies to, and retire old ones
  - retired technologies disappear from the wizard, but requests that used them keep them
  - the catalog starts with the brief's list (React, Next.js, .NET, Node.js, Python, Flutter, React Native, Swift, Kotlin, and common cloud options)
- **Clients:** chosen from the clients already used, or typed in as a new client. They are stored once and reused, ready for confidentiality masking later (F-14).

**Out of scope:**
- hours (estimates appear with the estimate workspace and matching, F-04, F-05 and F-24; until then the hours column shows "–")
- document upload and AI extraction: the Requirements step shows the upload area as "Coming soon" (F-09)
- feature library (F-15) and team experience, QA, PM, bug-fixing percentages and rate (estimate workspace and export, F-07)
- review and approval (F-10); statuses other than Draft exist only so the list and filters are ready
- assumptions, risks and client questions (F-07, F-09, F-13)
- versions (F-11) and audit log (F-20)

## Capabilities

### New Capabilities
- `estimation-requests`: creating and editing an estimation request through the wizard, what each step records, draft saving and completeness, the request page, and who may view, edit and delete a request.
- `home-screen`: the signed-in home page, with drafts, "continue where you left off", and the searchable, filterable list of requests.
- `tech-stack-catalog`: the Admin-managed list of technologies per part, used by the wizard.

### Modified Capabilities
- `app-shell`: the "Home page placeholder" requirement is removed; the home page is now defined by `home-screen`.

## Impact

- **Code:**
  - Home page (`/`), the wizard (`/estimates/new`, `/estimates/[id]/edit`) and the request page (`/estimates/[id]`)
  - Settings → Tech stack page, plus a small Settings sub-navigation
  - a server-side estimation request service with permission checks and server actions
- **Database:** new tables for clients, estimation requests, part selections with technologies, features, and the technology catalog (Prisma migration). The catalog is filled by the migration, and dev seed data adds a few sample requests.
- **Navigation:** "Estimates" in the sidebar becomes a working link to the request list on Home.
- **Dependencies:** none new.
- **Order:** this change removes an `app-shell` requirement that `add-authentication-and-roles` also modifies, so `add-authentication-and-roles` must be archived before this change is archived.
