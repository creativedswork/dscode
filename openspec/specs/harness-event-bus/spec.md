## Purpose

Typed event bus for decoupling Harness core from UI backends — all internal state changes flow through events.

## Requirements

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

The Application event catalog SHALL compose owner-defined payload contracts for
LLM, Tool, Turn, Processing, Session, UI notification, Config, MCP, Agent
Process, and Eval events. Presentation SHALL project these payloads rather than
features importing UI models.

#### Scenario: Discriminated union type-checking

- **WHEN** a handler is registered for `"tool:start"`
- **THEN** TypeScript SHALL infer the handler parameter type as `{ type: "tool:start"; name: string; args: unknown }`
- **AND** SHALL reject access to properties from other event types (e.g., `delta`)

#### Scenario: Every event has a unique type string

- **WHEN** the `HarnessEvent` type is inspected
- **THEN** no two union members SHALL have the same `type` literal value

#### Scenario: turn:end usage carries full token and cost data

- **WHEN** the `turn:end` event is emitted
- **THEN** its `usage` field SHALL be of type `{ input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } } | undefined`
- **AND** the `usage.input` field SHALL contain input token count
- **AND** the `usage.output` field SHALL contain output token count
- **AND** the `usage.cacheRead` field SHALL contain cache read token count
- **AND** the `usage.cacheWrite` field SHALL contain cache write token count
- **AND** the `usage.total` field SHALL contain total token count
- **AND** the `usage.cost.total` field SHALL contain the API cost in USD

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

The concrete `HarnessEventBus` SHALL be created by Bootstrap and injected into
Harness for the lifetime of one Agent Host. Internal coordinators SHALL publish
through the event bus; HarnessAPI consumers SHALL receive only its subscribe-only
event-source port.

#### Scenario: Composition Root creates event bus

- **WHEN** Bootstrap assembles an Agent Host
- **THEN** it SHALL create the concrete event bus before Harness and UI adapters

#### Scenario: Event bus accessible via HarnessAPI

- **WHEN** a consumer accesses `harness.events`
- **THEN** it SHALL receive the subscribe-only event source
- **AND** SHALL not be able to emit or clear events

### Requirement: Event payloads are presentation-neutral

Application and feature event modules MUST NOT import `src/ui/`, Web protocol
types, or TUI models.

#### Scenario: MCP connection state is emitted

- **WHEN** MCP publishes connection state
- **THEN** the event SHALL carry an MCP-owned snapshot
- **AND** Presentation SHALL derive Web and TUI models

#### Scenario: Architecture check scans event modules

- **WHEN** an event contract imports a Presentation type
- **THEN** architecture verification SHALL fail
