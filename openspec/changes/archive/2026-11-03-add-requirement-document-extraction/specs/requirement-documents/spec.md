## Purpose

Defines how requirement documents (client RFPs and specifications as PDF, Folio3 SOWs as Word) are uploaded to an estimation request, read by Claude into cited proposals, reviewed by the estimator, and added to the request.

## ADDED Requirements

### Requirement: Upload requirement documents
People who may edit a request SHALL be able to upload one or more PDF or Word (.docx) files to it, each up to 25 MB, and mark each as Client requirements or Folio3 SOW. A file SHALL be accepted only when its content is a real PDF or DOCX, whatever its name. Two files with the same name SHALL be separate documents. Everyone who can view the request SHALL see its documents and be able to download them; only people who may edit it SHALL upload or remove them.

#### Scenario: Upload an RFP
- **WHEN** the owner of a Draft uploads "Clinic RFP.pdf" (14 pages) as Client requirements
- **THEN** the document is listed on the Requirements step with its name, type, 14 pages and who uploaded it

#### Scenario: Wrong type or too large
- **WHEN** a person uploads "notes.xlsx", or "scan.pdf" of 30 MB
- **THEN** the upload is refused with "Upload a PDF or Word (.docx) file" or "Files can be up to 25 MB", and nothing is stored

#### Scenario: View-only person
- **WHEN** a Tech Lead who doesn't own a request opens its Requirements step
- **THEN** they can download the documents but see no upload or remove controls

### Requirement: Claude reads each document
After upload, each document SHALL be read by Claude in the background: a PDF as a document, so scanned pages are read too, and a DOCX as its text. The document SHALL show "Reading…", then "Ready to review" or "Failed" with the reason, and SHALL be able to be read again. Without an AI key, upload SHALL still work and the document SHALL show "AI reading isn't set up; add the features by hand".

#### Scenario: Ready to review
- **WHEN** the reading of "Clinic RFP.pdf" finishes
- **THEN** the document shows "Ready to review" with the number of features, details, assumptions, risks and questions found

#### Scenario: Reading fails
- **WHEN** Claude can't be reached or returns no usable answer
- **THEN** the document shows "Failed" with the reason and a "Read again" button, and nothing is added to the request

### Requirement: Proposals cite their source
Every proposed item SHALL cite its document, its page (or, for a DOCX, its section heading) and a short quote. Where the file has a text layer, the quote SHALL be checked against the document's own text and shown as "Quote checked"; otherwise it SHALL be shown as "Check the page". Items Claude is unsure of SHALL be flagged "Needs confirmation". Information the document doesn't give SHALL be left out, not guessed.

#### Scenario: Checked quote
- **WHEN** a proposed feature quotes "Patients book appointments online" from page 4 of a text PDF
- **THEN** the feature shows "Clinic RFP.pdf, page 4", the quote and "Quote checked"

#### Scenario: Scanned page
- **WHEN** a proposed feature comes from a scanned page with no text layer
- **THEN** it shows its page and quote with "Check the page"

#### Scenario: Not in the document
- **WHEN** the document never mentions browsers
- **THEN** no browser is proposed

### Requirement: Proposed features and request details
Reading a document SHALL propose features, each with a name, a short description and one or more parts (Backend, Web/Frontend, Admin Panel, Mobile, Cloud/Infrastructure). It SHALL also propose request details for wizard steps 1–3: project name, client, application types, operating systems, browsers, parts with technologies from the active catalog, hosting, environments, app stores, compliance standards and non-functional needs with notes.

#### Scenario: Request details from an RFP
- **WHEN** an RFP asks for a HIPAA-compliant web portal and an iOS app hosted on AWS
- **THEN** the proposals include application types Web and Mobile, operating system iOS, hosting AWS and compliance HIPAA, each with its quote

### Requirement: Proposed assumptions, risks and questions
Reading a document SHALL propose assumptions and risks, each for one part, and questions for the client where the document is unclear or contradictory. A technology the catalog doesn't have SHALL be proposed as a note on its part, not as a catalog entry.

#### Scenario: Unclear requirement
- **WHEN** the RFP mentions "integration with the clinic's records system" without naming it
- **THEN** a question for the client is proposed asking which records system, citing that passage

#### Scenario: Technology not in the catalog
- **WHEN** the document requires "Elixir" for the backend and the catalog has no Elixir
- **THEN** Backend is proposed with the note "Document asks for Elixir (not in the catalog)"

### Requirement: Review before adding
Nothing from a document SHALL change the request until a person who may edit it reviews and adds it. The review page SHALL let them tick, edit, delete, merge and split proposed features; tick or skip each request detail; and tick, edit or skip assumptions, risks and questions.

#### Scenario: Merge and split
- **WHEN** the estimator merges "Book appointment" and "Reschedule appointment" into "Appointment booking", and splits "Admin reports and exports" into two features
- **THEN** the list shows the merged feature citing both quotes, and two features each citing the original quote

#### Scenario: Leave without adding
- **WHEN** the estimator edits proposals and leaves the review page without clicking "Add to request"
- **THEN** the request is unchanged

### Requirement: Duplicates and filled-in values
A proposed feature whose name matches one already in the request, ignoring letter case and surrounding spaces, SHALL be flagged "Already in the request" and unticked. A proposed request detail for a field already filled in SHALL be unticked and show both values; ticking it adds the document's values to a list field (such as hosting) and replaces a single value (such as the project name).

#### Scenario: Existing value kept by default
- **WHEN** the request already has hosting "Azure" and the document proposes "AWS"
- **THEN** the hosting row shows "Azure (current)" and "AWS (document)", unticked

#### Scenario: Duplicate feature
- **WHEN** the request already has "User login" and the document proposes "user login"
- **THEN** the proposed feature is flagged "Already in the request" and unticked

### Requirement: Add to request
"Add to request" SHALL add only the ticked items, in one save: features at the end of the Requirements list with their parts (adding any part the request didn't have), request details into steps 1–3, assumptions and risks to their parts, and questions to the request's client questions. Adding SHALL be refused while the request can't be edited.

#### Scenario: Add the reviewed list
- **WHEN** the estimator ticks 12 features, hosting AWS, HIPAA, 3 assumptions and 2 questions, then clicks "Add to request"
- **THEN** the Requirements step lists the 12 new features, step 3 shows AWS and HIPAA, the parts show the assumptions and the request page shows the 2 questions

#### Scenario: Request in review
- **WHEN** someone tries to add items to a request that is In review
- **THEN** it is refused with "This request can no longer be edited" and nothing changes

### Requirement: After adding
The added features SHALL get estimate Tasks and be matched at once. The document SHALL then show when and by whom its items were added, and SHALL be able to be reviewed and added again, with items already added shown as added.

#### Scenario: Matched straight away
- **WHEN** 12 features have just been added from a document
- **THEN** the Estimate tab shows a suggestion or "No reliable match" for each of their Tasks without clicking "Find matches"

#### Scenario: Review again
- **WHEN** the estimator reopens the review of a document already added
- **THEN** the items added earlier show "Added" and are unticked

### Requirement: Documents stay private to the tool
Documents SHALL be stored in the tool's database and sent only to the configured AI provider for reading. They SHALL never be included in exports, emails or logs. Deleting a request SHALL delete its documents.

#### Scenario: Email after adding
- **WHEN** a request with an uploaded RFP is submitted for review
- **THEN** the Approver's email names the project but contains no document content

#### Scenario: Request deleted
- **WHEN** the owner deletes a Draft that has two documents
- **THEN** both documents and their extraction results are deleted
