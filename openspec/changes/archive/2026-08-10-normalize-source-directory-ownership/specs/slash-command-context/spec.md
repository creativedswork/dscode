## RENAMED Requirements

- FROM: `SlashCommandContext depends on HarnessAPI and UiBackend`
- TO: `SlashCommandContext depends on HarnessAPI and SlashCommandPresenter`

## MODIFIED Requirements

### Requirement: SlashCommandContext depends on HarnessAPI and SlashCommandPresenter

The slash command execution context SHALL contain
`{ harness: HarnessAPI, ui: SlashCommandPresenter }`.
`SlashCommandPresenter` SHALL be owned by `src/slash-commands/types.ts` and
SHALL contain only the output and interaction methods required by Slash Command
implementations. TUI and Web MAY satisfy the port structurally, but Slash
Command source MUST NOT import either concrete adapter.

#### Scenario: Slash command accesses Application behavior

- **WHEN** a Slash Command needs conversation, session, settings, MCP, Skill, Agent, or Eval behavior
- **THEN** it SHALL use the corresponding `context.harness` Command or Query port
- **AND** it SHALL NOT access a concrete Manager, Registry, Store, or Agent instance

#### Scenario: Slash command displays information

- **WHEN** a Slash Command needs to show an informational or error message
- **THEN** it SHALL call the corresponding `context.ui` presenter method
- **AND** the same command SHALL work with both TUI and Web presenters

#### Scenario: Slash command performs a Presenter-specific action

- **WHEN** a Slash Command needs to clear the conversation view, open the MCP browser, replay messages, or stage a pending image
- **THEN** the capability SHALL be declared on `SlashCommandPresenter`
- **AND** the implementation SHALL NOT probe optional methods on a concrete backend

### Requirement: No TuiApp dependency in slash commands

No Slash Command implementation SHALL import or reference `TuiApp`,
`TuiBackend`, or `WebUiBackend`. All command output and interaction SHALL go
through the owner-defined `SlashCommandPresenter` interface.

#### Scenario: Slash command feature has no Presentation adapter import

- **WHEN** the refactoring is complete
- **THEN** no file under `src/slash-commands/` SHALL import from `src/ui/tui/` or `src/ui/web/`
- **AND** the architecture checker SHALL reject such an import

## ADDED Requirements

### Requirement: Slash Command implementation has one source owner

Built-in command definitions, custom manifest loading, and command dispatch SHALL live under
`src/slash-commands/`. `src/ui/commands.ts` and `src/commands/` MUST NOT remain
as compatibility paths.

#### Scenario: Built-in and custom commands are enumerated

- **WHEN** TUI or Web requests Slash Command autocomplete or dispatch
- **THEN** built-in and custom commands SHALL be obtained from the same `src/slash-commands/` owner
- **AND** existing command names, arguments, help text, and execution behavior SHALL remain unchanged
