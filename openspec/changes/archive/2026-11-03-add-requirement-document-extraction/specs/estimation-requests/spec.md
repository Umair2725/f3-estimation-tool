## MODIFIED Requirements

### Requirement: Requirements step
Step 4 SHALL let the person add, edit, reorder and remove features, each with a name (required), an optional short description, and one or more of the request's chosen parts. It SHALL also show the request's requirement documents with their status, the upload area for people who may edit the request, and a link to review each document that is ready (specs/requirement-documents).

#### Scenario: Add a feature
- **WHEN** a person adds the feature "Appointment booking" with the description "Doctor availability, reminders" for Web/Frontend and Backend
- **THEN** the feature appears in the list with those parts

#### Scenario: Feature without a part
- **WHEN** a person tries to save a feature with no part selected
- **THEN** the feature is not saved and the form shows "Choose at least one part"

#### Scenario: Upload not yet available
- **WHEN** a person who may edit the request views the Requirements step
- **THEN** the upload area accepts PDF and Word (.docx) files instead of saying document upload is coming soon
