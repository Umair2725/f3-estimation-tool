## ADDED Requirements

### Requirement: Wizard keeps changes made elsewhere
When the wizard opens, or is returned to, after the request changed elsewhere (for example items added from a requirement document), it SHALL show the request as it is now. Saving the Requirements step SHALL remove only the features the person removed in that form; a feature added after the form loaded SHALL be kept.

#### Scenario: Back from adding document items
- **WHEN** a person on the Requirements step opens a document's review, adds 15 features, clicks "Back to Requirements" and then Finish
- **THEN** the Requirements step lists the 15 features with any typed earlier
- **AND** Finish does not ask to "Add at least one feature"

#### Scenario: Feature added in another tab
- **WHEN** a person has the Requirements step open, a feature is added from a document in another tab, and the person then saves the step without reloading
- **THEN** the feature added in the other tab is still in the request

#### Scenario: Removing a feature still works
- **WHEN** a person removes a feature in the Requirements step and saves
- **THEN** that feature and its estimate Tasks are removed
