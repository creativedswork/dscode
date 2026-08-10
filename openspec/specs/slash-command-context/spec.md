# slash-command-context Specification

## Purpose
TBD - created by archiving change code-maintainability-refactor. Update Purpose after archive.
## Requirements
### Requirement: SlashCommandContext depends on HarnessAPI and UiBackend
The slash command execution context SHALL be redefined as `SlashCommandContext` containing `{ harness: HarnessAPI, ui: UiBackend }`. The previous `CommandContext` type with `tui: TuiApp` SHALL be removed. Slash command `execute` functions SHALL receive this new context.

#### Scenario: Slash command accesses agent via harness
- **WHEN** a slash command needs the agent
- **THEN** it accesses `context.harness.agent` instead of `context.agent`

#### Scenario: Slash command accesses session via harness
- **WHEN** a slash command needs the session manager
- **THEN** it accesses `context.harness.sessionManager` instead of `context.sessionManager`

#### Scenario: Slash command modifies config via harness
- **WHEN** a slash command needs to change model or thinking settings
- **THEN** it calls `context.harness.setModel(id)`, `context.harness.setThinking(level)`, etc.

#### Scenario: Slash command displays info via ui
- **WHEN** a slash command needs to show an informational message
- **THEN** it calls `context.ui.addInfo(text)` — works for both TUI and Web

#### Scenario: Slash command requests permission via ui
- **WHEN** a slash command needs user permission
- **THEN** it calls `context.ui.getPromptPermission()()` — works for both TUI and Web

### Requirement: No TuiApp dependency in slash commands
No slash command implementation SHALL import or reference `TuiApp`. All UI interaction SHALL go through the `UiBackend` interface.

#### Scenario: Slash command file has no TuiApp import
- **WHEN** the refactoring is complete
- **THEN** no file in `src/slash-commands/` imports `TuiApp` or a concrete Web adapter

### Requirement: WebUiBackend removes mockTui
The `WebUiBackend` class SHALL NOT contain a `mockTui` object. Slash command execution in the Web path SHALL use `{ harness: this.harness, ui: this }` directly since `WebUiBackend` implements `UiBackend`.

#### Scenario: mockTui removed
- **WHEN** the refactoring is complete
- **THEN** `web-backend.ts` contains no variable or property named `mockTui`

#### Scenario: Web slash commands execute with real UiBackend
- **WHEN** a slash command is executed in web mode
- **THEN** the context's `ui` is the `WebUiBackend` instance, not a mock

### Requirement: executeSlashCommand signature updated
The `executeSlashCommand` function SHALL accept `SlashCommandContext` as its context parameter instead of the old `CommandContext`.

#### Scenario: TUI calls executeSlashCommand
- **WHEN** `TuiApp` processes a slash command input
- **THEN** it calls `executeSlashCommand(text, { harness: this.deps.harness, ui: this.tui })` (or equivalent with the new TuiBackend pattern)

#### Scenario: Web calls executeSlashCommand
- **WHEN** `WebUiBackend` processes a slash command input
- **THEN** it calls `executeSlashCommand(text, { harness: this.harness, ui: this })`

### Requirement: eval Command Registered in executeSlashCommand

The `executeSlashCommand` function SHALL route `/eval` commands to the eval command handler. The eval command SHALL be defined with name `"eval"`, description `"Analyze a session and generate diagnostic dashboard (/eval [session_id])"`, and an execute function that receives `(args: string, ctx: SlashCommandContext)`.

The execute function SHALL:
1. Parse `args.trim()` as the session ID (or `null` for current session)
2. Call `runEval(sessionId, ctx)` from the eval module
3. `runEval` SHALL handle session resolution, analysis, dashboard generation, and browser opening
4. The entire flow SHALL be wrapped in try/catch for graceful error handling

#### Scenario: /eval command routes to eval handler

- **WHEN** the user types `/eval 00MPX37L8`
- **THEN** `executeSlashCommand` SHALL parse `commandName` as `"eval"` and `args` as `"00MPX37L8"`
- **AND** invoke the eval command's execute function with those arguments and the SlashCommandContext

#### Scenario: /eval command uses SlashCommandContext

- **WHEN** the eval command executes
- **THEN** it SHALL access `ctx.harness.sessionManager` for session lookup via `getSessionFilePath()` and `loadSessionFile()`
- **AND** it SHALL access `ctx.harness.config` for model provider/key configuration
- **AND** it SHALL access `ctx.ui.addInfo()` and `ctx.ui.addError()` for user feedback
- **AND** it SHALL NOT import or reference `TuiApp`

#### Scenario: /eval appears in help text

- **WHEN** the user types `/help` or views slash command documentation
- **THEN** the eval command SHALL be listed among available commands with its description

#### Scenario: /eval errors are caught gracefully

- **WHEN** any unexpected error occurs during `/eval` execution
- **THEN** the system SHALL display `[error] eval: <message>` via `ctx.ui.addError()`
- **AND** NOT crash or leave the agent in an inconsistent state
