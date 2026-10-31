# Spec Delta

## MODIFIED Requirements

### Requirement: Branded page layout
Every page SHALL render inside a shared layout with a header that shows the product name "F3 Estimation Tool" and the Folio3 name, and a main content area. For a signed-in person, the layout SHALL also show their name and role and a "Sign out" control.

#### Scenario: Header on every page
- **WHEN** a user opens any page of the application
- **THEN** the page shows a header containing "F3 Estimation Tool"
- **AND** the page content appears below the header

#### Scenario: Signed-in person shown
- **WHEN** a signed-in Estimator named Sara opens any page
- **THEN** the layout shows "Sara" and "Estimator"
- **AND** a "Sign out" control is available

### Requirement: Home page placeholder
The root path `/` SHALL require sign-in and SHALL show a home page that names the tool, gives a one-line description of its purpose, and states that estimation features are coming soon.

#### Scenario: Open the home page
- **WHEN** a signed-in user with a role opens `/`
- **THEN** the page shows the title "F3 Estimation Tool"
- **AND** a short description of the tool's purpose
- **AND** a notice that estimation features are not yet available

#### Scenario: Home page while signed out
- **WHEN** a signed-out visitor opens `/`
- **THEN** they are redirected to `/sign-in`

## ADDED Requirements

### Requirement: Role-aware navigation
The layout SHALL include the navigation from the approved design (Home, Estimates, Reviews, Knowledge base, Settings) and SHALL show only the entries the signed-in person's role may use; on screens narrower than 820 px the navigation SHALL collapse behind a menu button.

#### Scenario: Estimator navigation
- **WHEN** a signed-in Estimator views any page
- **THEN** the navigation does not show "Settings" or "Reviews"

#### Scenario: Admin navigation
- **WHEN** a signed-in Admin views any page
- **THEN** the navigation shows "Settings"

#### Scenario: Phone width navigation
- **WHEN** any page is viewed at 375 px wide
- **THEN** the navigation is hidden behind a menu button
- **AND** the page does not scroll horizontally
