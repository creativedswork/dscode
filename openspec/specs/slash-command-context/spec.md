# slash-command-context Specification

## Purpose

Define Slash Commands as a presentation-neutral feature using HarnessAPI and
an owner-defined Presenter port shared by TUI and Web.

## Requirements

### Requirement: SlashCommandContext depends on HarnessAPI and SlashCommandPresenter

The Slash Command execution context SHALL contain the narrow HarnessAPI surface
and `SlashCommandPresenter`. It MUST NOT expose Agent, Manager, Registry, Store,
TuiApp, or WebUiBackend internals.

#### Scenario: Slash command accesses Application behavior

- **WHEN** a command needs conversation, Session, settings, MCP, Skill, Agent, or Eval behavior
- **THEN** it SHALL call the corresponding HarnessAPI command or query

#### Scenario: Slash command displays information

- **WHEN** a command completes or fails
- **THEN** it SHALL call the Presenter response port
- **AND** TUI and Web SHALL provide equivalent behavior

#### Scenario: Slash command performs a Presenter-specific action

- **WHEN** a command clears conversation, opens the MCP browser, replays messages, or stages an image
- **THEN** that operation SHALL be declared on `SlashCommandPresenter`
- **AND** implementation SHALL not probe a concrete backend

### Requirement: No TuiApp dependency in slash commands

No file under `src/slash-commands/` SHALL import a concrete TUI or Web adapter.
Architecture verification SHALL reject such a dependency.

#### Scenario: Slash command feature has no Presentation adapter import

- **WHEN** architecture verification scans Slash Commands
- **THEN** no import SHALL resolve to `src/ui/tui/` or `src/ui/web/`

### Requirement: WebUiBackend removes mockTui

WebUiBackend SHALL use a real `SlashCommandPresenter` adapter and MUST NOT
construct a mock TUI object.

#### Scenario: Web executes a command

- **WHEN** Web receives Slash Command input
- **THEN** it SHALL invoke the shared dispatcher with HarnessAPI and its Presenter adapter

### Requirement: executeSlashCommand signature updated

The shared Slash Command dispatcher SHALL accept boundary-safe
`SlashCommandContext`. TUI and Web SHALL call the same implementation.

#### Scenario: TUI executes a command

- **WHEN** TUI parses Slash Command input
- **THEN** it SHALL call the dispatcher with HarnessAPI and a TUI Presenter

#### Scenario: Web executes a command

- **WHEN** Web parses Slash Command input
- **THEN** it SHALL call the same dispatcher with HarnessAPI and a Web Presenter

### Requirement: eval Command Registered in executeSlashCommand

The `/eval [session_id]` command SHALL remain registered and SHALL use Eval and
Session Application ports rather than concrete stores or Managers.

#### Scenario: Historical Session is evaluated

- **WHEN** the user runs `/eval <session_id>`
- **THEN** the Eval port SHALL resolve and load the persisted domain snapshot
- **AND** current Main Process and Session behavior SHALL remain unchanged

#### Scenario: Eval reports progress

- **WHEN** Eval starts, progresses, completes, or fails
- **THEN** it SHALL publish Eval-owned events and a typed command result
- **AND** the Presenter SHALL render feedback without Eval importing UI modules

#### Scenario: Eval command appears in help

- **WHEN** available commands are queried
- **THEN** `/eval` SHALL retain its documented name and description

### Requirement: Slash Command implementation has one source owner

Built-in definitions, custom manifest loading, command management, dispatch, execution context, and Presenter contracts SHALL live under
`src/slash-commands/`.

#### Scenario: Built-in and custom commands are enumerated

- **WHEN** TUI or Web requests autocomplete or dispatch
- **THEN** built-in and custom commands SHALL come from the same feature owner
- **AND** existing names, arguments, help text, and behavior SHALL remain unchanged
