## ADDED Requirements

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
