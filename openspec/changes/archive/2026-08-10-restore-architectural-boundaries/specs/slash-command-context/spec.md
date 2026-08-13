## MODIFIED Requirements

### Requirement: SlashCommandContext depends on HarnessAPI and UiBackend
`SlashCommandContext` SHALL contain the narrow HarnessAPI command/query surface and a
Presentation response port for command output. It MUST NOT expose concrete Harness,
UiBackend, Pi Agent, SessionManager, DriverRegistry, ConfigWatch, or another Manager.

#### Scenario: Slash command invokes behavior
- **WHEN** a command needs to switch Session, update configuration, toggle a Skill,
  compact context, or run Eval
- **THEN** it SHALL call a typed HarnessAPI command or query
- **AND** it SHALL not coordinate concrete Managers

#### Scenario: Slash command displays a result
- **WHEN** a command completes or fails
- **THEN** it SHALL publish through the Presentation response port
- **AND** that port SHALL support equivalent TUI and Web output

### Requirement: executeSlashCommand signature updated
`executeSlashCommand` SHALL accept the boundary-safe SlashCommandContext. TUI and Web
MUST pass the same Application API contract and an adapter-specific Presenter port.

#### Scenario: TUI executes a command
- **WHEN** TUI parses slash input
- **THEN** it SHALL call `executeSlashCommand` with HarnessAPI and its Presenter adapter
- **AND** the command SHALL not receive TuiApp

#### Scenario: Web executes a command
- **WHEN** Web parses slash input
- **THEN** it SHALL call the same `executeSlashCommand` function with HarnessAPI and its Presenter adapter
- **AND** the command SHALL not receive WebUiBackend internals

### Requirement: eval Command Registered in executeSlashCommand
The `/eval [session_id]` command SHALL remain registered and SHALL analyze the selected
persisted Session through an Eval-specific Application command/query port. Slash Command
code MUST NOT access SessionManager, Harness config, AgentSupervisor, or UI backend
internals directly.

#### Scenario: Historical Session is evaluated
- **WHEN** the user runs `/eval 00MPX37L8`
- **THEN** the Eval Application port SHALL resolve and load the target persisted snapshot
- **AND** the current Main Process and Session SHALL retain their documented behavior

#### Scenario: Eval reports progress
- **WHEN** Eval starts, progresses, completes, or fails
- **THEN** it SHALL publish Eval-owned events and a typed command result
- **AND** the Presenter SHALL render user feedback without Eval importing UI modules

#### Scenario: Eval command appears in help
- **WHEN** available slash commands are queried
- **THEN** `/eval` SHALL retain its documented name and description
