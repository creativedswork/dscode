## ADDED Requirements

### Requirement: HarnessEventBus typed event emitter

The system SHALL provide a `HarnessEventBus` class with a discriminated union event type `HarnessEvent`. The `type` field SHALL serve as both the event discriminator and the subscription key. The class SHALL support `on(eventType, handler)` for subscription (returning an unsubscribe function) and `emit(event)` for synchronous dispatch.

#### Scenario: Subscribe and receive event

- **WHEN** a handler is registered via `bus.on("llm:text:delta", handler)`
- **AND** `bus.emit({ type: "llm:text:delta", delta: "Hello" })` is called
- **THEN** the handler SHALL be invoked with `{ type: "llm:text:delta", delta: "Hello" }`

#### Scenario: Unsubscribe stops delivery

- **WHEN** `const off = bus.on("llm:text:delta", handler)` is called
- **AND** `off()` is called to unsubscribe
- **AND** `bus.emit({ type: "llm:text:delta", delta: "Hello" })` is subsequently called
- **THEN** the handler SHALL NOT be invoked

#### Scenario: Multiple handlers receive same event

- **WHEN** two handlers A and B are registered for `"tool:start"`
- **AND** `bus.emit({ type: "tool:start", name: "bash", args: {} })` is called
- **THEN** both handler A and handler B SHALL be invoked in registration order

#### Scenario: Handler throws does not break other handlers

- **WHEN** handler A throws an error during event dispatch
- **THEN** handler B (registered after A) SHALL still be invoked
- **AND** the error SHALL be caught and logged

#### Scenario: Emit with no subscribers does not throw

- **WHEN** `bus.emit({ type: "mcp:browser:open" })` is called and no handlers are registered
- **THEN** the call SHALL complete without throwing

### Requirement: HarnessEvent complete event catalog

The `HarnessEvent` discriminated union SHALL include all event types in the catalog: LLM streaming (`llm:thinking:delta`, `llm:text:delta`, `llm:retry`, `llm:usage`), Tool (`tool:start`, `tool:end`), Turn lifecycle (`turn:start`, `turn:streaming:start`, `turn:streaming:end`, `turn:end`, `turn:abort`, `turn:error`), Processing (`processing:start`, `processing:stop`), Session (`session:created`, `session:loaded`, `session:saved`, `session:deleted`), UI (`message:user`, `ui:info`, `ui:error`, `ui:warning`, `ui:image:pending`, `ui:conversation:clear`, `ui:focus:editor`), Config (`config:change`), and MCP (`mcp:state`, `mcp:browser:open`, `mcp:app:registered`).

#### Scenario: Discriminated union type-checking

- **WHEN** a handler is registered for `"tool:start"`
- **THEN** TypeScript SHALL infer the handler parameter type as `{ type: "tool:start"; name: string; args: unknown }`
- **AND** SHALL reject access to properties from other event types (e.g., `delta`)

#### Scenario: Every event has a unique type string

- **WHEN** the `HarnessEvent` type is inspected
- **THEN** no two union members SHALL have the same `type` literal value

### Requirement: turn:abort carries reason field

The `turn:abort` event SHALL include a `reason` field with value `"user"` or `"system"`. `"user"` indicates the user explicitly triggered abort (e.g., Esc key, abort button). `"system"` indicates a system-initiated abort (e.g., shutdown, timeout, session switch).

#### Scenario: User abort has reason "user"

- **WHEN** the user clicks abort or presses Esc
- **THEN** `this.events.emit({ type: "turn:abort", reason: "user" })` SHALL be called

#### Scenario: System abort has reason "system"

- **WHEN** the system aborts due to shutdown or session switch
- **THEN** `this.events.emit({ type: "turn:abort", reason: "system" })` SHALL be called

#### Scenario: Frontend differentiates abort reason

- **WHEN** the frontend receives a `turn:abort` message
- **THEN** it SHALL use the `reason` field to display appropriate messaging
- **AND** `"user"` may show "Cancelled" while `"system"` may show "Session interrupted"

### Requirement: HarnessEventBus ownership and lifecycle

The `HarnessEventBus` SHALL be created by `Harness` in its constructor as `this.events`. It SHALL be exposed to consumers via `HarnessAPI.events`. The bus SHALL exist for the full lifetime of the Harness instance — no start/stop lifecycle.

#### Scenario: Harness creates event bus

- **WHEN** `new Harness(config)` is called
- **THEN** `this.events` SHALL be a new `HarnessEventBus` instance

#### Scenario: Event bus accessible via HarnessAPI

- **WHEN** a consumer accesses `harness.events`
- **THEN** it SHALL receive the `HarnessEventBus` instance without type errors
