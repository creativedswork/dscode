## Requirements

### Requirement: Strip slash command prefix from session titles

The session title extraction SHALL strip leading slash-command prefixes from user messages before using them as title candidates. A message starting with `/command` or `/command argument` SHALL have the `/command` portion stripped, leaving the argument as the title candidate.

#### Scenario: Command with meaningful argument

- **WHEN** the first user message is `/opsx:propose fix-session-title`
- **THEN** the session title SHALL be `fix-session-title` (not the raw command string)

#### Scenario: Command with short argument

- **WHEN** the first user message is `/config dark` and the argument is fewer than 3 characters after trimming
- **THEN** the system SHALL skip this message and look for the next non-command user message for the title

#### Scenario: Command with no argument

- **WHEN** the first user message is `/help` with no argument
- **THEN** the system SHALL skip this message and look for the next non-command user message for the title

#### Scenario: Non-command message

- **WHEN** the first user message is "Debug the session title bug in manager.ts"
- **THEN** the session title SHALL be the first 60 characters of that message, unchanged

#### Scenario: Message with array content containing command

- **WHEN** the first user message has array content where the first text block starts with `/opsx:propose add-auth`
- **THEN** the session title SHALL be `add-auth`

### Requirement: Prefer non-command messages over command arguments

When selecting a session title from user messages, the system SHALL prefer the first user message that does NOT start with a slash command. Only if ALL user messages start with slash commands SHALL the system fall back to extracting the argument from the first command message.

#### Scenario: First message is command, second is substantive

- **WHEN** messages are [`/help`, `How do I fix the session title bug?`]
- **THEN** the session title SHALL be derived from `How do I fix the session title bug?` (first 60 chars)

#### Scenario: All messages are commands

- **WHEN** all user messages start with slash commands and the first is `/opsx:propose fix-session-title`
- **THEN** the session title SHALL be `fix-session-title` (argument of the first command)

### Requirement: Update session title on subsequent saves

The session title SHALL be re-evaluated on every `saveSession()` call, not just when the title is "New session". If a more substantive title candidate is found from recent messages, the title SHALL be updated.

#### Scenario: Title improves from command to substantive message

- **WHEN** a session's current title is `/help` (set from first message) and the latest user message is "Debug session manager title extraction logic"
- **THEN** on the next `saveSession()`, the title SHALL update to the first 60 characters of "Debug session manager title extraction logic"

#### Scenario: Title stays when current title is already substantive

- **WHEN** a session's current title is "Debug session manager title extraction" (derived from a non-command message)
- **THEN** on subsequent `saveSession()` calls, the title SHALL NOT be replaced by a shorter or less substantive candidate

#### Scenario: Title not updated for existing non-command titles

- **WHEN** a session's title was already set from a non-command user message (not a command remnant)
- **THEN** the title SHALL remain stable unless a significantly longer or more descriptive candidate is found

### Requirement: Title max length of 60 characters

Session titles SHALL be truncated to at most 60 characters, same as the current behavior.

#### Scenario: Long message truncated

- **WHEN** the extracted title candidate is longer than 60 characters
- **THEN** the title SHALL be the first 60 characters of the candidate
