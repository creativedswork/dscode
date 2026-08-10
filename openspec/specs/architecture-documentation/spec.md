# architecture-documentation Specification

## Purpose

Define how architecture documentation uses implementation-grounded Agent as OS analogies and distinguishes active context, recoverable state, and persistent memory.

## Requirements

### Requirement: Agent as OS mappings reflect runtime semantics

Architecture documentation SHALL map Agent concepts to OS concepts according to their capacity, lifecycle, volatility, and persistence behavior. The context window SHALL be described as RAM or an Agent process working set, not as CPU registers.

#### Scenario: Context window mapping is documented

- **WHEN** a reader inspects the Agent as OS mapping
- **THEN** the context window SHALL map to `RAM / Agent 进程工作集`
- **AND** the mapping SHALL be consistent with token budgeting, compaction, and overflow recovery

### Requirement: Context and persistent memory remain distinct

Architecture documentation SHALL distinguish active model context from persisted Session snapshots and cross-Session Memory. It SHALL identify ContextManager as the working-set manager, Session or Runtime Snapshot as recoverable backing state, and MemoryManager as persistent long-term knowledge storage.

#### Scenario: Reader compares Context and Memory

- **WHEN** a reader follows the memory hierarchy explanation
- **THEN** the document SHALL explain that MemoryManager content persists across Sessions
- **AND** persistent memories SHALL only affect inference after being injected into the active context
- **AND** the document SHALL NOT imply that MemoryManager and the context window are the same storage layer

### Requirement: OS analogy does not invent managed components

Architecture documentation MUST NOT assign a dscode runtime component to an OS concept unless the mapping is supported by current implementation behavior.

#### Scenario: Register analogy is considered

- **WHEN** the document discusses the context window or dscode-managed Agent state
- **THEN** it SHALL NOT label the context window as registers
- **AND** it MAY omit a register mapping because model-internal execution state is outside the Harness contract

### Requirement: Architecture documentation defines enforceable module boundaries

The active architecture document SHALL include the source ownership model,
dependency directions, and designated concrete composition roots enforced by
architecture verification.

#### Scenario: Contributor adds a feature

- **WHEN** a contributor adds an Integration, Driver, Application use case, or UI feature
- **THEN** the document SHALL identify its owner and allowed dependencies

#### Scenario: Composition Root exception is reviewed

- **WHEN** concrete cross-owner construction is required
- **THEN** the document SHALL identify the designated Bootstrap location
- **AND** state that the exception permits wiring rather than feature logic

### Requirement: OS mappings distinguish ABI from implementation ownership

Architecture documentation SHALL distinguish the Agent-as-OS runtime analogy
from physical source ownership and SHALL describe Application commands,
queries, events, and Process Tools using their real boundaries.

#### Scenario: Driver needs current cwd

- **WHEN** the Driver/Agent boundary is documented
- **THEN** cwd and attribution SHALL cross through the Kernel Execution Context ABI
- **AND** Driver SHALL not be described as reading AgentSupervisor internals

#### Scenario: UI invokes Harness behavior

- **WHEN** the UI/Application boundary is documented
- **THEN** UI SHALL use Commands, Queries, and Events
- **AND** direct Manager or mutable Agent access SHALL be identified as forbidden

### Requirement: Documentation and architecture checks remain synchronized

Documented dependency rules and machine-readable architecture checks SHALL use
the same ownership model and composition exceptions.

#### Scenario: Boundary rule changes

- **WHEN** a proposal changes an allowed dependency or composition exception
- **THEN** it SHALL update the architecture document and automated rule set
- **AND** verification SHALL cover accepted and rejected imports

### Requirement: Source directory documentation reflects active owners

Architecture documentation SHALL include the active top-level source tree and
resolve Harness, Agent definitions, Slash Commands, Project Files, Skills, MCP,
and Presentation adapters to their current owners.

#### Scenario: Reader follows the source tree

- **WHEN** a reader uses `docs/ARCHITECTURE.md` to locate a component
- **THEN** every documented path SHALL resolve
- **AND** `src/application/` SHALL be distinguished from `src/agents/definitions/`

#### Scenario: Removed component is searched

- **WHEN** a Registry, Factory, compatibility entry, or source root is removed
- **THEN** diagrams and startup flows SHALL stop naming it
- **AND** documentation verification SHALL reject stale Core, Utils, or IntegrationRegistry references

### Requirement: Capability grouping does not imply shared source ownership

Architecture documentation SHALL distinguish user-facing capability grouping
from backend ownership.

#### Scenario: Reader compares Skill and MCP

- **WHEN** a reader inspects Skill and MCP responsibilities
- **THEN** Skill SHALL own instructions, activation, and Tool allowlists
- **AND** MCP SHALL own protocol, transport, connection, state, and Driver contribution
- **AND** the document SHALL not invent a shared lifecycle or Registry
