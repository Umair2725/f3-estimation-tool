# Spec Delta

## Purpose

Defines the Admin-managed list of technologies, grouped by the project parts they apply to, that estimation requests pick from.

## ADDED Requirements

### Requirement: Starting catalog
The catalog SHALL start with the technologies named in the product brief, each marked for the parts it applies to. It SHALL include at least React, Next.js, Angular and Vue for Web/Frontend and Admin Panel; Node.js, .NET, Python, Java and PHP for Backend; Flutter, React Native, Swift and Kotlin for Mobile; and AWS, Azure and Google Cloud for Cloud/Infrastructure.

#### Scenario: Fresh installation
- **WHEN** the database has just been set up
- **THEN** the wizard offers React Native for Mobile and Node.js for Backend without any Admin action

### Requirement: Admins manage the catalog
Admins SHALL be able to add a technology with a name and one or more parts, change its name and parts, and retire or restore it, under Settings → Tech stack. Names SHALL be unique without regard to letter case. Other roles SHALL be refused with 403.

#### Scenario: Add a technology
- **WHEN** an Admin adds "Svelte" for Web/Frontend
- **THEN** the wizard offers Svelte for Web/Frontend

#### Scenario: Duplicate name
- **WHEN** an Admin adds "react" while "React" exists
- **THEN** it is refused with "React is already in the catalog"

#### Scenario: Non-Admin
- **WHEN** an Estimator calls the catalog-management action directly
- **THEN** the response is 403 and nothing changes

### Requirement: Retiring keeps history
A retired technology SHALL no longer be offered for new selections, but requests that already use it SHALL keep it and show it as retired. Technologies SHALL never be deleted once a request uses them.

#### Scenario: Retire a technology in use
- **WHEN** an Admin retires "AngularJS" while a request uses it
- **THEN** the wizard no longer offers AngularJS for new selections
- **AND** the existing request still shows "AngularJS (retired)"
