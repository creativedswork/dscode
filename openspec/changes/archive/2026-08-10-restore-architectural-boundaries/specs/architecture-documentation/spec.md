## ADDED Requirements

### Requirement: Architecture documentation defines enforceable module boundaries
The active architecture document SHALL include a module ownership table and dependency
direction diagram covering Bootstrap/Composition Root, Kernel/Application, Agent
Process, Service Process, Driver, Integration, Persistence, Configuration, and
Presentation. Each boundary SHALL identify allowed dependencies, forbidden dependencies,
and the contract used to cross it.

#### Scenario: Contributor adds a feature
- **WHEN** a contributor reads the architecture document before adding an Integration,
  Driver, Application use case, or UI feature
- **THEN** the document SHALL identify where its types and implementation belong
- **AND** it SHALL identify which dependency directions architecture verification enforces

#### Scenario: Composition Root exception is reviewed
- **WHEN** concrete cross-layer construction is required
- **THEN** the document SHALL identify the designated Composition Root files
- **AND** it SHALL state that the exception permits wiring but not feature logic

### Requirement: OS mappings distinguish ABI from implementation ownership
Architecture documentation SHALL map Application commands/queries and Process Tools to
callable interfaces, Execution Context to Kernel process context ABI, AgentSupervisor
to Agent process lifecycle ownership, ServiceSupervisor to external service lifecycle
ownership, and Presentation adapters to user-facing clients. It MUST NOT use the OS
analogy to justify exposing concrete Manager or PCB objects to UI.

#### Scenario: Driver needs current cwd
- **WHEN** the Driver/Agent boundary is documented
- **THEN** cwd and process attribution SHALL cross through Execution Context ABI
- **AND** Driver SHALL not be described as reading AgentSupervisor internals

#### Scenario: UI invokes Harness behavior
- **WHEN** the UI/Application boundary is documented
- **THEN** UI SHALL use Commands, Queries, and Events
- **AND** direct access to Agent state or Manager instances SHALL be identified as forbidden

### Requirement: Documentation and architecture checks remain synchronized
The documented dependency rules and the machine-readable architecture check SHALL use
the same module classifications and exceptions.

#### Scenario: Boundary rule changes
- **WHEN** a proposal changes an allowed dependency or Composition Root exception
- **THEN** it SHALL update both the architecture document and automated rule set
- **AND** verification SHALL include fixtures for accepted and rejected imports
