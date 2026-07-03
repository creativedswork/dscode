## MODIFIED Requirements

### Requirement: SlashCommandContext depends on HarnessAPI and UiBackend
The slash command execution context SHALL be redefined as `SlashCommandContext` containing `{ harness: HarnessAPI, ui: UiBackend, customCommands: CommandManifest[] }`. The previous `CommandContext` type with `tui: TuiApp` SHALL be removed. Slash command `execute` functions SHALL receive this new context.

#### Scenario: Slash command accesses agent via harness
- **WHEN** a slash command needs the agent
- **THEN** it accesses `context.harness.agent` instead of `context.agent`

#### Scenario: Slash command accesses session via harness
- **WHEN** a slash command needs the session manager
- **THEN** it accesses `context.harness.sessionManager` instead of `context.sessionManager`

#### Scenario: Slash command accesses custom commands
- **WHEN** a slash command needs the list of custom commands
- **THEN** it accesses `context.customCommands`

## ADDED Requirements

### Requirement: Custom commands listed in slash autocomplete
The slash command autocomplete provider SHALL include custom commands from `CommandManifest[]` in the suggestions list.

#### Scenario: Custom commands appear before built-in commands
- **WHEN** there are 2 custom commands and 10 built-in commands
- **THEN** autocomplete shows custom commands first, followed by built-in commands

#### Scenario: No custom commands available
- **WHEN** `customCommands` is an empty array
- **THEN** autocomplete shows only built-in commands
