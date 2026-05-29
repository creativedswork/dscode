## MODIFIED Requirements

### Requirement: UiBackend interface abstraction
The Harness SHALL depend on a `UiBackend` interface rather than a concrete TUI implementation, allowing different UI backends to be plugged in. The WebUiBackend SHALL handle the `set_vision_delete` config command by clearing the vision configuration and persisting the change.

#### Scenario: CLI mode uses TuiBackend
- **WHEN** dscode starts without `--web` flag
- **THEN** the Harness creates and uses a `TuiBackend` instance (wrapping existing `TuiApp`)

#### Scenario: Web mode uses WebUiBackend
- **WHEN** dscode starts with `--web` flag
- **THEN** the Harness creates and uses a `WebUiBackend` instance

#### Scenario: All UiBackend methods are called correctly
- **WHEN** the Agent produces any UI event (text delta, tool call, permission prompt, etc.)
- **THEN** the corresponding UiBackend method is invoked with the correct parameters

#### Scenario: WebUiBackend handles set_vision_delete
- **WHEN** the WebUiBackend receives a `set_vision_delete` config command
- **THEN** it sets `this.config.vision` to `undefined`, persists the removal via `saveUserConfig({ vision: null })`, broadcasts the updated ConfigData, and sends an info event confirming deletion
