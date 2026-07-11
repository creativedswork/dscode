## ADDED Requirements

### Requirement: Command prompt echo is truncated

The system SHALL display the original command text entered by the user (not the expanded template) for slash commands that expand and are sent to the agent, while the full expanded text is still transmitted to the agent unchanged.

#### Scenario: Long command prompt is truncated

- **WHEN** a user submits a slash command whose original input text exceeds 80 characters and the expanded text is sent to the agent
- **THEN** the conversation view displays only the first line of the original input text, followed by a gray `(N chars)` count on the next line

#### Scenario: Short command prompt is not truncated

- **WHEN** a user submits a slash command whose original input text is 80 characters or fewer
- **THEN** the conversation view displays the full original input text without truncation

#### Scenario: Multi-line command prompt shows first line only

- **WHEN** a slash command's original input text spans multiple lines
- **THEN** only the first line of the original input is displayed, followed by the gray character count

### Requirement: System-level output renders in full

System-level slash commands whose output is NOT sent to the agent SHALL render in full without truncation.

#### Scenario: Built-in slash command output is not truncated

- **WHEN** a user runs a built-in slash command like `/help`, `/memory list`, or `/config`
- **THEN** all output renders completely without truncation

#### Scenario: addInfo content is not truncated

- **WHEN** the system calls `addInfo()` or `addNotice()` to display information
- **THEN** the content renders completely without truncation

### Requirement: Truncation indicator format

The truncation indicator SHALL use dimmed/gray styling and display the total character count of the original text.

#### Scenario: Character count format

- **WHEN** a command prompt of 1234 characters is truncated
- **THEN** the indicator displays `(1,234 chars)` in gray/dimmed style on a new line below the truncated text
