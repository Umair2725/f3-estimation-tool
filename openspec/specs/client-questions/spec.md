# client-questions Specification

## Purpose
Defines the questions for the client kept on an estimation request: added from a requirement document or typed in, shown on the request page, and edited by people who may edit the request.

## Requirements

### Requirement: Questions for the client on a request
A request SHALL keep a list of questions for the client. People who may edit the request SHALL be able to add, edit and remove questions; everyone who can view it SHALL see them on the request page. A question added from a document SHALL keep its source (document, page or section, and quote).

#### Scenario: Question from a document
- **WHEN** the estimator adds the proposed question "Which EHR system must the portal integrate with?" from page 7 of "Clinic RFP.pdf"
- **THEN** the request page lists it with "Clinic RFP.pdf, page 7"

#### Scenario: Typed question
- **WHEN** the owner adds the question "Is single sign-on required?" on the request page
- **THEN** it is listed with no source

#### Scenario: View only
- **WHEN** a Tech Lead who doesn't own the request opens its page
- **THEN** they see the questions without add, edit or remove controls

### Requirement: Questions stay out of the lean export
Client questions SHALL NOT be written to the Excel export in this release; the template's Questions sheet stays excluded until F-13.

#### Scenario: Export with questions
- **WHEN** a request with three client questions is exported
- **THEN** the workbook has no Questions sheet, as before
