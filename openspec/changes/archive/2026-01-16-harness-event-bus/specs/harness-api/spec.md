## ADDED Requirements

### Requirement: HarnessAPI exposes event bus

The `HarnessAPI` interface SHALL expose a `readonly events: HarnessEventBus` field so that consumers (UI backends, session manager, WebSocket server) can subscribe to Harness events without depending on the full `Harness` class.

#### Scenario: HarnessAPI events field is readonly

- **WHEN** a consumer accesses `harness.events`
- **THEN** it receives the `HarnessEventBus` instance
- **AND** the field is typed as `readonly events: HarnessEventBus`

#### Scenario: WebUiBackend subscribes via HarnessAPI

- **WHEN** `WebUiBackend` constructor receives `{ harness: HarnessAPI }`
- **THEN** it SHALL call `harness.events.on(...)` to subscribe to events
- **AND** TypeScript SHALL compile without errors

#### Scenario: TuiBackend subscribes via HarnessAPI

- **WHEN** `TuiBackend` constructor receives `{ harness: HarnessAPI }`
- **THEN** it SHALL call `harness.events.on(...)` to subscribe to events
- **AND** TypeScript SHALL compile without errors
