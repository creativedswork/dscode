## MODIFIED Requirements

### Requirement: Session title derived from first non-command user message

The `SessionManager` SHALL derive the session title from the first user message that does not start with a slash command. If all user messages start with slash commands, the system SHALL extract the argument from the first command message after stripping the `/command` prefix. The title SHALL be truncated to 60 characters. On subsequent saves, the title SHALL be re-evaluated and updated if a more substantive candidate is found from later user messages.

#### Scenario: First message is a slash command with argument

- **WHEN** `saveSession()` is called and the first user message is `/opsx:propose fix-session-title`
- **THEN** the session title SHALL be set to `fix-session-title`

#### Scenario: First message is a slash command without argument

- **WHEN** `saveSession()` is called and the first user message is `/help` and the second is "How do I fix this bug?"
- **THEN** the session title SHALL be set to the first 60 characters of "How do I fix this bug?"

#### Scenario: First message is plain text

- **WHEN** `saveSession()` is called and the first user message is "Debug session title extraction"
- **THEN** the session title SHALL be set to "Debug session title extraction" (unchanged from current behavior)

#### Scenario: Title updates on subsequent saves

- **WHEN** `saveSession()` is called and the title is currently a command remnant like "help", and a later user message is "Debug the title extraction logic"
- **THEN** the title SHALL be updated to the first 60 characters of "Debug the title extraction logic"

#### Scenario: Array content with command text block

- **WHEN** the first user message has `content: [{ type: "text", text: "/opsx:propose add-auth" }]`
- **THEN** the session title SHALL be set to `add-auth`
