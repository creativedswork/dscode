## ADDED Requirements

### Requirement: Large paste notification SHALL be shown exactly once per paste

When a user pastes text exceeding the large-paste threshold (>10 lines or >1000 characters) into the TUI prompt editor, the system SHALL display an informational message indicating that a large paste was accepted and instructing the user to press Enter to submit. This notification SHALL appear exactly once per paste event, even if the user subsequently types additional characters before submitting.

#### Scenario: Large multi-line paste triggers single notification

- **WHEN** user pastes 20 lines of text into the TUI prompt
- **THEN** the system SHALL display exactly one notification: "Large paste accepted — [paste #N +20 lines]. Press Enter to submit full content."
- **AND** subsequent keystrokes in the editor SHALL NOT trigger additional paste notifications

#### Scenario: Large single-line paste triggers single notification

- **WHEN** user pastes a single line of 2000 characters into the TUI prompt
- **THEN** the system SHALL display exactly one notification: "Large paste accepted — [paste #N 2000 chars]. Press Enter to submit full content."
- **AND** subsequent keystrokes in the editor SHALL NOT trigger additional paste notifications

#### Scenario: Small paste does not trigger notification

- **WHEN** user pastes 5 lines of text (under 10 lines, under 1000 chars) into the TUI prompt
- **THEN** the system SHALL NOT display a large paste notification

#### Scenario: Second large paste after first triggers new notification

- **WHEN** user pastes a large text (triggers notification #1)
- **AND** user submits the content by pressing Enter (clearing the paste marker)
- **AND** user pastes another large text
- **THEN** the system SHALL display a new notification for the second paste
