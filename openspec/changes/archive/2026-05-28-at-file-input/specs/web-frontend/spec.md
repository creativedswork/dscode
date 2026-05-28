## MODIFIED Requirements

### Requirement: Input area
The frontend SHALL provide a text input area at the bottom of the screen for composing messages, triggering slash commands, and inserting file references via `@` autocomplete.

#### Scenario: Text input and submit
- **WHEN** user types text and presses Enter (or clicks send button)
- **THEN** a `chat` command is sent via WebSocket with the input text

#### Scenario: Slash command autocomplete
- **WHEN** user types `/` in the input field
- **THEN** a dropdown appears listing available commands with descriptions, and typing filters the list

#### Scenario: At-file autocomplete
- **WHEN** user types `@` in the input field
- **THEN** a dropdown appears listing files from the project directory matching the text after `@`, and typing filters the list

#### Scenario: Multi-line input
- **WHEN** user presses Shift+Enter in the input field
- **THEN** a new line is inserted without submitting

#### Scenario: Input disabled during processing
- **WHEN** the agent is processing a request (loader visible)
- **THEN** the input field is disabled and shows a "Processing..." placeholder
