## MODIFIED Requirements

### Requirement: Strip slash command prefix from session titles

The session title extraction SHALL strip leading slash-command prefixes from user messages before using them as title candidates. A message starting with `/command` or `/command argument` SHALL have the `/command` portion stripped, leaving the argument as the title candidate. The command regex SHALL match colon characters (`:`) within command names so that commands like `/opsx:apply`, `/opsx:propose`, `/opsx:explore`, and `/opsx:archive` are fully stripped.

Additionally, messages that consist solely of low-information noise (see `session-title-noise-filter` spec) SHALL be skipped as title candidates regardless of whether they contain a command prefix.

#### Scenario: Command with colon and meaningful argument

- **WHEN** the first user message is `/opsx:apply fix login bug`
- **THEN** the command prefix `/opsx:apply ` SHALL be fully stripped
- **AND** the title candidate SHALL be `fix login bug`

#### Scenario: Command with short argument

- **WHEN** the first user message is `/config dark` and the argument is fewer than 10 characters after trimming
- **THEN** the system SHALL skip this message and look for another qualifying user message for the title

#### Scenario: Command with no argument

- **WHEN** the first user message is `/help` with no argument
- **THEN** the system SHALL skip this message and look for another qualifying user message for the title

#### Scenario: Non-command message

- **WHEN** a user message is "Debug the session title bug in manager.ts"
- **THEN** the session title SHALL be the first 60 characters of that message, unchanged

#### Scenario: Message with array content containing colon command

- **WHEN** a user message has array content where the first text block starts with `/opsx:propose add-auth`
- **THEN** the command prefix `/opsx:propose ` SHALL be fully stripped
- **AND** the title candidate SHALL be `add-auth`

#### Scenario: Noise message skipped

- **WHEN** a user message is "thanks" or "好的"
- **THEN** the system SHALL skip this message and look for another qualifying user message

### Requirement: Prefer last qualifying non-command message

When selecting a session title from user messages, the system SHALL scan messages in reverse order and select the *last* user message that qualifies as a title candidate (non-command, non-noise, ≥ 10 characters after stripping). Only if NO user messages qualify SHALL the system fall back to extracting the argument from the last command message, or the first message text, or "New session".

#### Scenario: Last message is substantive

- **WHEN** messages are [`/help`, `How do I fix the session title bug?`, `Actually, the real issue is the regex`]
- **THEN** the session title SHALL be derived from `Actually, the real issue is the regex` (first 60 chars)

#### Scenario: Last qualifying message used over earlier ones

- **WHEN** messages are [`Debug login bug`, `thanks!`, `Now also check the signup flow`]
- **THEN** the `thanks!` message is skipped as noise
- **AND** the session title SHALL be derived from `Now also check the signup flow`

#### Scenario: All messages are commands

- **WHEN** all user messages start with slash commands and the last is `/opsx:apply redesign auth system`
- **THEN** the session title SHALL be `redesign auth system` (argument of the last command, after stripping prefix)

#### Scenario: All messages are noise

- **WHEN** all user messages are noise (e.g., `ok`, `thanks`, `好的`)
- **THEN** the system SHALL fall back to the first message's raw text or "New session"

### Requirement: Update session title on subsequent saves

The session title SHALL be re-evaluated on every `saveSession()` call. When the last qualifying user message has changed, the title SHALL update to reflect the new last qualifying message.

#### Scenario: Title updates when topic shifts

- **WHEN** a session's current title is "Debug session manager title extraction" and the latest qualifying user message is "Redesign the auth module from scratch"
- **THEN** on the next `saveSession()`, the title SHALL update to "Redesign the auth module from scratch" (truncated to 60 chars)

#### Scenario: Title stays when last qualifying message unchanged

- **WHEN** a session's current title is derived from message M and the last qualifying message is still M (no newer qualifying messages)
- **THEN** on subsequent `saveSession()` calls, the title SHALL remain unchanged

#### Scenario: Title not replaced by noise

- **WHEN** a session's current title is "Debug session manager title extraction" and the last user message is "ok thanks"
- **THEN** the title SHALL NOT change because "ok thanks" is filtered as noise
