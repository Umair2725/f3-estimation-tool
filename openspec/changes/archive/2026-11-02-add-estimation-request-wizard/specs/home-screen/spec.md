# Spec Delta

## Purpose

Defines the signed-in home page: the entry point for starting a request, resuming drafts and finding any estimation request.

## ADDED Requirements

### Requirement: Home page requires sign-in
The root path `/` SHALL require sign-in. A signed-out visitor SHALL be redirected to `/sign-in`, and a signed-in person without a role SHALL see the waiting-for-access page.

#### Scenario: Signed out
- **WHEN** a signed-out visitor opens `/`
- **THEN** they are redirected to `/sign-in`

### Requirement: Start and resume from home
The home page SHALL greet the person by first name and show a "New estimation request" button, the number of their own Drafts, and a "Continue where you left off" card for their most recently updated Draft that opens the wizard at the step they last saved. The card SHALL be hidden when they have no Drafts.

#### Scenario: Resume the latest draft
- **WHEN** Sara has two Drafts and last saved step 3 of "Patient portal MVP"
- **THEN** the home page shows "My drafts: 2"
- **AND** "Continue where you left off" names "Patient portal MVP" and opens it at step 3

#### Scenario: No drafts
- **WHEN** a person has no Drafts
- **THEN** the "Continue where you left off" card is not shown and "My drafts" shows 0

### Requirement: Request list
The home page SHALL list estimation requests, newest update first, showing project, client, status, owner, parts, hours (min–max) and last updated. Hours SHALL show "–" until a request has estimated hours. Each row SHALL open the request page. The list SHALL show at most 25 rows per page, with pagination.

#### Scenario: List columns
- **WHEN** a person opens the home page and a Draft "Patient portal MVP" for "Northwind Clinics" by Sara with parts Web/Frontend and Backend exists
- **THEN** its row shows those values, status "Draft", hours "–" and when it was last updated

#### Scenario: Empty list
- **WHEN** no requests exist
- **THEN** the list says there are no requests yet and offers "New estimation request"

### Requirement: Search and filter the list
The list SHALL offer quick filters All, Mine, In review and Approved; a search box matching project or client name (case-insensitive, partial); and filters by client, status, owner and technology. Filters SHALL combine, be reflected in the page address so they can be shared, and show a "Clear filters" control when active.

#### Scenario: Mine
- **WHEN** Sara selects "Mine"
- **THEN** only requests owned by Sara are listed

#### Scenario: Search and filter combined
- **WHEN** a person searches "portal" and filters by technology "React Native"
- **THEN** only requests whose project or client contains "portal" and that use React Native are listed

#### Scenario: Shareable filters
- **WHEN** a person opens a copied home page address that includes the status filter Draft
- **THEN** the list opens already filtered to Draft

#### Scenario: Nothing matches
- **WHEN** the filters match no request
- **THEN** the list says no requests match and offers "Clear filters"
