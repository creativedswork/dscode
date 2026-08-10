# runtime-presentation-boundary Specification

## Purpose

Keep Runtime and persistence records presentation-neutral while allowing TUI
and Web to share deterministic live and replay projections.

## Requirements

### Requirement: Runtime and persistence models are presentation-neutral

Agent Runtime, Session, MCP, Eval, Integration, Driver, and Service modules SHALL expose owner-defined domain records and MUST NOT construct or import UI
DTOs.

#### Scenario: Tool execution completes

- **WHEN** Agent Runtime records a completed Tool execution
- **THEN** it SHALL emit a stable, presentation-neutral execution record
- **AND** SHALL not construct `ToolResultProjection`

#### Scenario: Session is persisted

- **WHEN** SessionStore serializes messages or Agent Process references
- **THEN** stored data SHALL contain domain and persistence fields only
- **AND** no field type SHALL be imported from `src/ui/`

### Requirement: Presentation projectors own UI transformation

Presentation SHALL provide pure projectors that convert Application events and
persisted snapshots into the canonical UI model used by TUI and Web.

#### Scenario: Live event is rendered

- **WHEN** a Tool, Agent, Session, Config, MCP, or Eval event arrives
- **THEN** a Presentation projector SHALL produce the corresponding UI model
- **AND** adapters SHALL not reinterpret domain data independently

#### Scenario: Persisted Session is replayed

- **WHEN** a Session snapshot is loaded
- **THEN** the same projection rules SHALL reconstruct display state
- **AND** live and replayed records SHALL preserve stable identities

### Requirement: Application event payloads use owner-defined contracts

Application events SHALL compose payload contracts from their semantic feature
owners rather than redefine feature or Presentation state.

#### Scenario: MCP state changes

- **WHEN** MCP connection state is published
- **THEN** the event SHALL carry an MCP-owned snapshot
- **AND** Presentation SHALL project it for TUI and Web

#### Scenario: Eval dashboard progresses

- **WHEN** Eval publishes pipeline progress
- **THEN** the payload SHALL use an Eval-owned progress type
- **AND** Application events SHALL not redefine Eval state

### Requirement: Presentation adapters do not inspect mutable runtime internals

TUI and Web SHALL obtain data through HarnessAPI queries and subscribe-only
events. They MUST NOT inspect Agent state, Manager, Registry, or Store
internals.

#### Scenario: Tool result details are inspected

- **WHEN** a user opens Tool result details
- **THEN** Presentation SHALL query the stable result through HarnessAPI
- **AND** SHALL not search Agent or Session internals

#### Scenario: Context usage is displayed

- **WHEN** a UI requests context usage
- **THEN** HarnessAPI SHALL return a read-only usage snapshot
- **AND** the UI SHALL not call ContextManager directly

### Requirement: TUI and Web preserve behavioral parity

Moving projection and orchestration boundaries MUST preserve equivalent
canonical conversation, Tool, Agent, and Session behavior in TUI and Web.

#### Scenario: Same event sequence reaches both adapters

- **WHEN** TUI and Web consume equivalent Application events
- **THEN** their canonical conversation states SHALL be semantically equivalent
- **AND** Tool and Agent updates SHALL match by stable identity
