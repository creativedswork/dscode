## MODIFIED Requirements

### Requirement: HarnessEvent complete event catalog
The Application event catalog SHALL compose owner-defined event payload contracts for
LLM streaming, Tool execution, Turn lifecycle, Processing, Agent Process, Eval, Session,
notification, Config, and MCP events. Existing event type strings and observable
ordering SHALL remain compatible, but Core MUST NOT define feature-specific payloads
from Presentation DTOs.

#### Scenario: Feature event is added
- **WHEN** MCP, Eval, Session, Agent Process, or another feature adds an event payload
- **THEN** the payload contract SHALL be declared by that feature owner
- **AND** the Application catalog SHALL compose or reference the contract

#### Scenario: Presentation consumes an event
- **WHEN** a handler subscribes to a typed event such as `tool:start`
- **THEN** TypeScript SHALL infer the owner-defined payload type
- **AND** Presentation SHALL project that payload into its canonical UI model

#### Scenario: Turn usage is published
- **WHEN** a turn completes with usage information
- **THEN** the event SHALL preserve input, output, cache read, cache write, total, and cost data
- **AND** TUI and Web SHALL observe the same semantic values

### Requirement: HarnessEventBus ownership and lifecycle
The concrete event bus SHALL be created by the Composition Root and live for the
Application lifetime. Internal coordinators SHALL receive an event-publisher port;
HarnessAPI and Presentation SHALL receive a subscribe-only event-source port.

#### Scenario: Coordinator publishes an event
- **WHEN** an internal coordinator receives an owned subsystem state change
- **THEN** it SHALL publish through the event-publisher port
- **AND** it SHALL not depend on a Presentation backend

#### Scenario: Consumer subscribes
- **WHEN** TUI, Web, or another observer receives HarnessAPI
- **THEN** it SHALL subscribe through the event-source port
- **AND** it SHALL not be able to emit or clear events

## ADDED Requirements

### Requirement: Event payloads are presentation-neutral
Application and feature event modules MUST NOT import `src/ui/`, Web protocol types,
TUI components, presentation reducers, or presentation projections.

#### Scenario: MCP connection state is emitted
- **WHEN** MCP publishes connection state
- **THEN** the event SHALL carry an MCP-owned snapshot
- **AND** the Web protocol and TUI model SHALL be derived by Presentation adapters

#### Scenario: Architecture check scans event modules
- **WHEN** an event contract imports a Presentation type
- **THEN** the architecture verification SHALL fail with the forbidden dependency
