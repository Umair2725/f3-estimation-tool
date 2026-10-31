# Spec Delta

## Purpose

Defines how people create and keep an estimation request: the four-step wizard, what each step records, draft saving and completeness, the request page, and who may view, edit or delete a request.

## ADDED Requirements

### Requirement: Start a new request
Any signed-in person with a role SHALL be able to start a new estimation request from "New estimation request". Saving the first step with a project name SHALL create the request as a Draft owned by that person, with the project manager defaulting to their name and the date to today.

#### Scenario: Create a draft from step 1
- **WHEN** an Estimator opens "New estimation request", enters the project name "Patient portal MVP" and saves
- **THEN** a request with status Draft exists, owned by that Estimator
- **AND** the project manager is the Estimator's name and the date is today, unless they changed them

#### Scenario: Project name required
- **WHEN** someone tries to save step 1 with an empty project name
- **THEN** nothing is created and the form shows "Enter a project name"

### Requirement: Four wizard steps
The wizard SHALL have four steps in this order: Project; Platforms & stack; Environment & compliance; Requirements. It SHALL show a stepper with the current step and SHALL let the person go Back, jump to any earlier step, and use "Save & exit" on every step.

#### Scenario: Stepper and navigation
- **WHEN** a person on step 3 clicks "Project" in the stepper
- **THEN** step 1 opens with the saved answers filled in

#### Scenario: Save & exit
- **WHEN** a person clicks "Save & exit" on step 2
- **THEN** the step's answers are saved and they return to the home page
- **AND** the request is still a Draft

### Requirement: Project step
Step 1 SHALL record the project name, client, project manager and date. The client SHALL be chosen from clients already used in the tool or typed as a new client; a new client name SHALL be stored once and reused, matched without regard to letter case or surrounding spaces.

#### Scenario: Reuse an existing client
- **WHEN** a person types "northwind clinics " and a client "Northwind Clinics" already exists
- **THEN** the request is linked to the existing "Northwind Clinics" client and no duplicate client is created

#### Scenario: New client
- **WHEN** a person types a client name that doesn't exist yet and saves
- **THEN** a new client with that name is created and linked to the request

### Requirement: Platforms and stack step
Step 2 SHALL record the application types (Web, Mobile, Desktop), operating systems, browsers, and the parts the project needs (Backend, Web/Frontend, Admin Panel, Mobile, Cloud/Infrastructure). For each chosen part the person SHALL pick one or more technologies from the active catalog entries for that part.

#### Scenario: Choose parts and technologies
- **WHEN** a person selects the parts Backend with "Node.js" and Mobile with "React Native" and saves
- **THEN** the request has exactly those two parts with those technologies

#### Scenario: Only active technologies for the part are offered
- **WHEN** a person picks technologies for the Mobile part
- **THEN** only active catalog technologies marked for Mobile are offered

#### Scenario: Removing a part
- **WHEN** a person removes the Mobile part from a request whose features use Mobile
- **THEN** the step warns which features lose that part before saving
- **AND** after saving, those features no longer list Mobile

### Requirement: Environment and compliance step
Step 3 SHALL record hosting (AWS, Azure, Google Cloud, on-premises, client-managed), whether staging and production environments are needed, app store publishing (Apple App Store, Google Play), compliance standards (HIPAA, GDPR, SOC 2, PCI-DSS), and accessibility, performance and load, security and documentation needs, each with an optional note, plus free-text other considerations.

#### Scenario: Record compliance with a note
- **WHEN** a person ticks HIPAA and Security with the note "Pen test before launch" and saves
- **THEN** the request page shows HIPAA under compliance and Security with "Pen test before launch"

### Requirement: Requirements step
Step 4 SHALL let the person add, edit, reorder and remove features, each with a name (required), an optional short description, and one or more of the request's chosen parts. The document upload area SHALL be shown as not yet available.

#### Scenario: Add a feature
- **WHEN** a person adds the feature "Appointment booking" with the description "Doctor availability, reminders" for Web/Frontend and Backend
- **THEN** the feature appears in the list with those parts

#### Scenario: Feature without a part
- **WHEN** a person tries to save a feature with no part selected
- **THEN** the feature is not saved and the form shows "Choose at least one part"

#### Scenario: Upload not yet available
- **WHEN** a person views the Requirements step
- **THEN** the upload area says document upload is coming soon and accepts no files

### Requirement: Draft saved at every step
Moving to another step, Back, Save & exit and Finish SHALL save the current step's answers. The wizard SHALL show when the draft was last saved, and an incomplete request SHALL always remain savable as a Draft.

#### Scenario: Leave and resume
- **WHEN** a person completes step 2, closes the browser, and later opens the draft
- **THEN** the wizard reopens with the step 1 and step 2 answers kept

#### Scenario: Saved indicator
- **WHEN** a step is saved
- **THEN** the wizard shows "Draft saved" with the time of the last save

### Requirement: Finish checks completeness
Finish SHALL check that the request has a client, at least one part with at least one technology, and at least one feature. If something is missing it SHALL list what is missing with a link to the step; otherwise it SHALL open the request page. The request stays a Draft.

#### Scenario: Incomplete request
- **WHEN** a person clicks Finish on a request with no features
- **THEN** the wizard lists "Add at least one feature" with a link to the Requirements step
- **AND** the request page does not open

#### Scenario: Complete request
- **WHEN** a person clicks Finish on a complete request
- **THEN** the request page opens and the status is Draft

### Requirement: Request page
Every request SHALL have a page showing all saved answers by step, the features grouped by part, the owner, status and last updated time. It SHALL show "Edit" and "Delete draft" only to people allowed to use them.

#### Scenario: View a request
- **WHEN** a signed-in Tech Lead opens another person's request page
- **THEN** they see every answer and the features grouped by part
- **AND** no Edit or Delete draft control is shown

### Requirement: Who may view and change a request
Every signed-in person with a role SHALL be able to view every request. Only the request's owner or an Admin SHALL be able to edit it, and only while it is a Draft or Changes requested. Only the owner or an Admin SHALL be able to delete it, and only while it is a Draft. These rules SHALL be checked on the server.

#### Scenario: Editing someone else's draft
- **WHEN** an Estimator who is not the owner opens the edit page of another person's draft, or calls the server action directly
- **THEN** the change is refused with "Only the owner or an Admin can edit this request" and nothing changes

#### Scenario: Admin edits a draft
- **WHEN** an Admin edits another person's draft
- **THEN** the change is saved and the owner stays the same

#### Scenario: Delete a draft
- **WHEN** the owner deletes their draft after confirming
- **THEN** the request and its features no longer exist and they return to the home page
- **AND** the client stays, for reuse

#### Scenario: Person without a role
- **WHEN** a signed-in person without a role opens a request page or calls a request API
- **THEN** they see the waiting-for-access page, or the API responds 403
