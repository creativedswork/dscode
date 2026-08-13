## ADDED Requirements

### Requirement: Canonical conversation types are Presentation-owned
Canonical conversation types SHALL be Presentation-owned. `UIMessage`, `ToolCallEntry`,
`ToolResultProjection`, `AgentActivity`, and related types SHALL remain Presentation
models shared by TUI and Web.
Runtime, persistence, Driver, MCP, Eval, and Application event modules MUST NOT import
these types.

#### Scenario: Runtime Tool record is projected
- **WHEN** Presentation receives a runtime Tool execution event
- **THEN** a pure projector SHALL create or update `ToolCallEntry`
- **AND** the Runtime SHALL remain unaware of the projected type

#### Scenario: Session is rebuilt for display
- **WHEN** Presentation receives a persisted Session snapshot
- **THEN** a projector SHALL produce canonical conversation messages
- **AND** Session persistence types SHALL not embed Presentation DTOs

### Requirement: Conversation projectors are pure boundary adapters
Live-event and persisted-snapshot projectors SHALL be deterministic and side-effect-free.
They MAY format labels and summaries for display, but MUST NOT mutate Runtime, Session,
Manager, Registry, or configuration state.

#### Scenario: Same execution is projected twice
- **WHEN** a projector receives identical input snapshots and events
- **THEN** it SHALL return structurally equivalent canonical conversation output
- **AND** no underlying domain record SHALL be modified

#### Scenario: Tool detail requires full text
- **WHEN** a projected Tool entry contains a stable result reference
- **THEN** Presentation SHALL resolve it through a HarnessAPI query
- **AND** the projector SHALL not inspect Agent or Session stores directly
