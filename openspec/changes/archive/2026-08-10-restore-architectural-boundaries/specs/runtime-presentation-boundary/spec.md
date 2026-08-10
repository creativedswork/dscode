## ADDED Requirements

### Requirement: Runtime and persistence models are presentation-neutral
Agent Runtime, Session, MCP, Eval, Integration, Driver, and Service modules SHALL expose
domain records, snapshots, and events without importing Presentation types, reducers,
formatters, themes, or projectors.

#### Scenario: Tool execution completes
- **WHEN** Agent Runtime records a completed Tool execution
- **THEN** it SHALL emit a presentation-neutral execution record with stable identity
- **AND** it SHALL not construct `ToolResultProjection` or another UI DTO

#### Scenario: Session is persisted
- **WHEN** SessionStore serializes Main messages or child Agent records
- **THEN** the stored data SHALL contain domain and persistence fields only
- **AND** no field type SHALL be imported from `src/ui/`

### Requirement: Presentation projectors own UI transformation
Presentation SHALL provide pure projectors that convert Application events and persisted
domain snapshots into canonical conversation, configuration, MCP, Agent activity, and
dashboard models consumed by TUI and Web.

#### Scenario: Live event is rendered
- **WHEN** a Tool, Agent, Session, Config, MCP, or Eval event is received
- **THEN** the Presentation projector SHALL produce the corresponding canonical UI model
- **AND** TUI and Web SHALL consume that projected model rather than reinterpreting domain data

#### Scenario: Persisted Session is replayed
- **WHEN** a Session snapshot is loaded
- **THEN** the same Presentation projection rules SHALL reconstruct the display model
- **AND** replayed and live representations SHALL preserve the same stable identities

### Requirement: Application event payloads use owner-defined contracts
Application event payloads SHALL use owner-defined contracts. The Application event
catalog MAY compose events from multiple capabilities, but each payload type SHALL be
defined by the capability that owns its semantics. The event bus
MUST NOT import DTOs from Presentation.

#### Scenario: MCP state changes
- **WHEN** MCP connection state is published
- **THEN** the event SHALL carry an MCP-owned state snapshot
- **AND** Presentation SHALL project it into `McpServerInfo`

#### Scenario: Eval dashboard progresses
- **WHEN** Eval publishes pipeline progress
- **THEN** the payload SHALL use an Eval-owned progress type
- **AND** Core events SHALL not redefine Eval-specific state

### Requirement: Presentation adapters do not inspect mutable runtime internals
TUI and Web SHALL obtain data through Application queries and subscribe-only event
sources. They MUST NOT inspect or mutate Pi Agent state, Manager collections,
ToolRegistry internals, ConfigWatch, or AgentSupervisor process objects directly.

#### Scenario: Tool result details are inspected
- **WHEN** a user opens Tool result details
- **THEN** Presentation SHALL query a stable Tool result reference through the Application API
- **AND** it SHALL not search `agent.state.messages` or AgentProcess runtime snapshots directly

#### Scenario: Context usage is displayed
- **WHEN** a UI requests token and context usage
- **THEN** an Application query SHALL return a read-only context usage snapshot
- **AND** the UI SHALL not call ContextManager directly

### Requirement: TUI and Web preserve behavioral parity
Moving projection and orchestration boundaries MUST preserve existing TUI and Web
observable behavior, protocol fields, stable identities, and ordering.

#### Scenario: Same event sequence reaches both adapters
- **WHEN** TUI and Web consume an equivalent Application event sequence
- **THEN** their canonical conversation states SHALL be semantically equivalent
- **AND** Tool and Agent updates SHALL match by stable ID rather than display label
