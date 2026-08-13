## ADDED Requirements

### Requirement: Standard Agent Host composition is reusable
The repository SHALL provide a callable standard Agent Host composition function that
constructs the same Application, Agent Process, Session, Tool, Skill, Memory, MCP,
Permission, Integration, and managed-service capabilities used by the dscode CLI.
The function MUST NOT construct a TUI/Web adapter or depend on CLI argument parsing.

#### Scenario: CLI starts the standard Host
- **WHEN** the dscode CLI starts
- **THEN** its CLI Composition Root SHALL call the standard Agent Host composition function
- **AND** it SHALL add only CLI, Presentation, interaction, and process-lifecycle adapters

#### Scenario: Headless Host is constructed
- **WHEN** a trusted in-process consumer constructs the standard Agent Host without a UI
- **THEN** it SHALL receive the same Application command, query, event, and Agent feature behavior
- **AND** Host construction SHALL not require TUI/Web objects

### Requirement: Agent authoring definitions are separate from runtime snapshots
The Agent subsystem SHALL define a source-neutral `AgentDefinition` authoring contract
separate from `AgentApplicationSnapshot`. AgentDefinition MUST NOT contain registry
generation, content digest, resolved source metadata, Process identity, Runtime state,
or lifecycle state.

#### Scenario: Programmatic definition is compiled
- **WHEN** a trusted host supplies an AgentDefinition programmatically
- **THEN** the Agent Application compiler SHALL validate and compile it into an immutable
  AgentApplicationSnapshot
- **AND** the snapshot SHALL receive source identity, digest, and registry generation during compilation

#### Scenario: Agent.md is compiled
- **WHEN** the registry loads a Markdown Agent.md
- **THEN** the parser SHALL first produce the same AgentDefinition contract
- **AND** compilation SHALL use the same validation and snapshot construction path as a
  programmatic definition

### Requirement: Programmatic and file-defined Agents have standard feature parity
Agents compiled from equivalent AgentDefinition and Agent.md inputs SHALL use the same
AgentSupervisor, Runtime factory, capability derivation, Permission enforcement, Session
routing, Tool/Skill resolution, Memory behavior, MCP availability, and SubAgent process model.
Definition source MUST NOT create a privileged execution path.

#### Scenario: Equivalent definitions are spawned
- **WHEN** one Agent is defined programmatically and another through Agent.md with equivalent fields
- **THEN** both SHALL be spawned through the same AgentSupervisor and Runtime factory contracts
- **AND** their effective capabilities SHALL differ only where their declared definitions or
  owning Host configuration differ

#### Scenario: Programmatic definition requests a denied capability
- **WHEN** a programmatic AgentDefinition requests a Tool denied by the Host or parent process
- **THEN** capability derivation SHALL preserve monotonic permission narrowing
- **AND** programmatic origin SHALL not bypass PermissionManager

### Requirement: Mutable runtime state is Agent Host scoped
Every mutable facility that can affect Runtime behavior SHALL belong to one Agent Host
instance or be provided through an instance-owned port. This includes EventBus, runtime
configuration, Agent Process Table, Session and Process stores, registries, permission
state, checkpoints, invalidation queues, undo state, caches, and managed-service ownership.
Production modules MUST NOT use mutable module-level collections as cross-Host runtime state.

#### Scenario: Two Hosts run in one Node.js process
- **WHEN** two Agent Hosts use different workspaces, settings, Sessions, and Agent definitions
- **THEN** commands and events in one Host SHALL not change or expose state from the other Host
- **AND** shutting down one Host SHALL not stop processes or services owned by the other Host

#### Scenario: Shared immutable catalog is used
- **WHEN** multiple Hosts use a module-level catalog or helper
- **THEN** the shared value SHALL be immutable or behaviorally stateless
- **AND** Host-specific registration or cache entries SHALL remain in instance-owned state

### Requirement: Execution attribution distinguishes Agent Host instances
Kernel Execution Context SHALL include immutable Host identity in addition to Agent
Process and workspace attribution. Logs, checkpoints, invalidation, and other shared
infrastructure MUST preserve Host identity when it is required to avoid collisions.

#### Scenario: Process identifiers collide across Hosts
- **WHEN** two Hosts contain otherwise equivalent Main Agent or Session identifiers
- **THEN** Kernel attribution SHALL distinguish them by Host identity
- **AND** stored or cached runtime data SHALL not collide across Hosts

#### Scenario: Agent Runtime binds context
- **WHEN** a Host starts a Main or SubAgent Runtime
- **THEN** AgentSupervisor SHALL bind both Host and Agent Process identity at the Runtime entry
- **AND** downstream Drivers SHALL obtain that attribution through the Kernel ABI

### Requirement: Process-wide side effects belong to the CLI adapter
The reusable Agent Host factory MUST NOT install process signal/fatal handlers, call
`process.exit()`, mutate `process.env`, or call `process.chdir()`. Application
coordinators, Kernel, and feature modules inherit the same restriction. The CLI adapter
MAY perform these operations only as explicit process-host behavior outside the
reusable Agent Host.

#### Scenario: Project workspace changes
- **WHEN** an Application command switches one Agent Host to another project
- **THEN** the Host SHALL update its own workspace, scoped stores, and Execution Context defaults
- **AND** the Node.js process cwd SHALL remain unchanged

#### Scenario: Compatibility environment is resolved
- **WHEN** the CLI constructs an Agent Host
- **THEN** it SHALL pass an explicit read-only environment snapshot to configuration resolvers
- **AND** runtime credential or settings changes SHALL not write back to `process.env`

#### Scenario: Embedded Host shuts down
- **WHEN** an in-process consumer shuts down an Agent Host
- **THEN** the Host SHALL release only its owned resources
- **AND** it SHALL not terminate the embedding Node.js process

### Requirement: Agent Host lifecycle is explicit and idempotent
The standard composition function SHALL return an Agent Host with explicit identity,
Application API access, startup, and shutdown lifecycle operations. Startup failure and
shutdown MUST be observable through returned results or errors rather than process exit.

#### Scenario: Host is shut down repeatedly
- **WHEN** shutdown is requested more than once
- **THEN** all calls SHALL complete without duplicate resource termination
- **AND** the Host SHALL remain in a terminal stopped state

#### Scenario: Host startup fails
- **WHEN** a required Application dependency cannot initialize
- **THEN** startup SHALL reject with a structured error or failure result
- **AND** already-created Host resources SHALL be cleaned up without exiting the process

### Requirement: SDK candidate contracts remain implementation neutral
SDK candidate contracts SHALL remain implementation neutral. Application commands,
queries, events, lifecycle results, AgentDefinition, and public snapshots SHALL use
owner-defined immutable contracts without concrete Manager, Registry, Supervisor,
Presentation, terminal, WebSocket, child-process, or mutable store references. This
change MUST NOT treat internal source paths as committed npm exports or a public SemVer
surface.

#### Scenario: Future SDK wrapper consumes the Host
- **WHEN** a future SDK adapter wraps the standard Agent Host
- **THEN** it SHALL be able to delegate through Application and lifecycle contracts
- **AND** it SHALL not require access to Harness internals or Presentation implementations

#### Scenario: Internal implementation is replaced
- **WHEN** a Manager, Registry, Driver, or storage implementation changes
- **THEN** Agent Host contracts SHALL remain expressed in owner-defined values and ports
- **AND** consumers holding only those contracts SHALL not depend on the replaced concrete class
