## ADDED Requirements

### Requirement: onConfigChange callback
The `UiBackend` interface SHALL expose an optional `onConfigChange(): void` method that Harness calls whenever ConfigWatch fires a change notification. Each backend implementation decides how to handle the notification.

#### Scenario: WebUiBackend broadcasts config on change
- **WHEN** `WebUiBackend.onConfigChange()` is called
- **THEN** it broadcasts `{ type: "config", data: this.buildConfigData() }` to all connected WebSocket clients

#### Scenario: TuiBackend treats onConfigChange as no-op
- **WHEN** `TuiBackend.onConfigChange()` is called
- **THEN** it performs no operation, because the TUI shares the same config object reference and is already synchronized

#### Scenario: Harness calls onConfigChange on every mutation
- **WHEN** any ConfigWatch setter is invoked (via Harness methods, slash commands, or WebSocket config commands)
- **THEN** `harness.ui.onConfigChange?.()` is called, ensuring both TUI and Web UI backends are notified
