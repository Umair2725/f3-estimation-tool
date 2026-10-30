# Spec Delta

## Purpose

Provides the common frame that every screen of the F3 Estimation Tool sits in, including branding, the header, the home page placeholder, and friendly not-found and error pages, so later features add screens rather than rebuild layout.

## ADDED Requirements

### Requirement: Branded page layout
Every page SHALL render inside a shared layout with a header that shows the product name "F3 Estimation Tool" and the Folio3 name, and a main content area.

#### Scenario: Header on every page
- **WHEN** a user opens any page of the application
- **THEN** the page shows a header containing "F3 Estimation Tool"
- **AND** the page content appears below the header

### Requirement: Home page placeholder
The root path `/` SHALL show a home page that names the tool, gives a one-line description of its purpose, and states that estimation features are coming soon.

#### Scenario: Open the home page
- **WHEN** a user opens `/`
- **THEN** the page shows the title "F3 Estimation Tool"
- **AND** a short description of the tool's purpose
- **AND** a notice that estimation features are not yet available

### Requirement: Not-found page
The system SHALL show a friendly not-found page, inside the shared layout and with a link back to the home page, for any unknown path.

#### Scenario: Unknown path
- **WHEN** a user opens a path that does not exist, such as `/does-not-exist`
- **THEN** the response status is 404
- **AND** the page shows a "Page not found" message with a link to `/`

### Requirement: Error page
When an unexpected error occurs while rendering a page, the system SHALL show a friendly error page inside the shared layout, and MUST NOT show stack traces or internal error details to the user.

#### Scenario: Rendering error
- **WHEN** an unexpected error occurs while a page renders
- **THEN** the user sees a "Something went wrong" message with an option to try again
- **AND** no stack trace or internal error text is shown
- **AND** the error is written to the server log

### Requirement: Usable on common screen sizes
The layout SHALL be readable without horizontal scrolling on screens from 375 px wide (phone) to desktop, and SHALL follow the user's light or dark system preference.

#### Scenario: Phone width
- **WHEN** the home page is viewed at 375 px wide
- **THEN** all text is readable and the page does not scroll horizontally

#### Scenario: Dark mode preference
- **WHEN** the user's system prefers a dark color scheme
- **THEN** the layout uses dark background and light text colors
