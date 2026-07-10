## ADDED Requirements

### Requirement: Slash command autocomplete fills without submitting
When the user selects a slash command from autocomplete using Enter, the system SHALL fill the command name into the editor and SHALL NOT submit it immediately. The user SHALL be able to add arguments or review the command before explicitly pressing Enter a second time to execute.

#### Scenario: Enter selects slash command from autocomplete
- **WHEN** the user presses `/` to open autocomplete, navigates to a command (e.g., `/session`), and presses Enter
- **THEN** the command name is filled into the editor with a trailing space, autocomplete closes, and the command is NOT executed
- **AND** the cursor is positioned after the trailing space, ready for argument input

#### Scenario: Tab selects slash command from autocomplete
- **WHEN** the user presses `/` to open autocomplete, navigates to a command, and presses Tab
- **THEN** the command name is filled into the editor with a trailing space, autocomplete closes, and the command is NOT executed
- **AND** behavior is identical to the Enter selection scenario

#### Scenario: Manual Enter submits normally
- **WHEN** the user manually types a full slash command (e.g., `/reset`) and presses Enter while autocomplete is NOT active
- **THEN** the command is executed immediately as before
