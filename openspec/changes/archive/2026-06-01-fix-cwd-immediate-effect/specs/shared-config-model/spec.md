## MODIFIED Requirements

### Requirement: Canonical ConfigData type
The shared module SHALL define a canonical `ConfigData` type representing the current harness configuration as exposed to UIs. `projectPath` SHALL reflect the current session working directory, which defaults to `process.cwd()` at startup and MAY be changed at runtime via `/config cwd` without restart.

#### Scenario: Config fields
- **WHEN** configuration is sent to the UI
- **THEN** `ConfigData` includes `provider`, `modelId`, `apiKey` (masked), `thinkingLevel`, `projectPath`, `maxTokens`, `providers[]`, `models[]`, optional `vision`, `visionProviders[]`, `visionModels[]`

#### Scenario: projectPath defaults to process.cwd
- **WHEN** dscode starts without a previously persisted cwd
- **THEN** `projectPath` SHALL equal `process.cwd()` resolved

#### Scenario: projectPath changes at runtime
- **WHEN** user executes `/config cwd <new-path>` in TUI or `set_project_path` in Web
- **THEN** `projectPath` SHALL update immediately to the resolved new path without requiring restart
