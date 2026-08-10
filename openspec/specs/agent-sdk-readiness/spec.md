# agent-sdk-readiness Specification

## Purpose

Define the reusable, headless Agent Host boundary that preserves standard
runtime capabilities without exposing CLI or presentation side effects.

## Requirements

### Requirement: Standard Agent Host composition is reusable

The repository SHALL provide a callable standard Agent Host composition
function that can be used by the CLI or a trusted in-process consumer.

#### Scenario: CLI starts the standard Host

- **WHEN** the dscode CLI starts
- **THEN** Bootstrap SHALL construct the standard Agent Host
- **AND** add only CLI, Presentation, interaction, and process-lifecycle adapters

#### Scenario: Headless Host is constructed

- **WHEN** a trusted consumer constructs the standard Agent Host without a UI
- **THEN** it SHALL receive the same Application commands, queries, events, and Agent capabilities
- **AND** construction SHALL not require TUI or Web objects

### Requirement: Agent authoring definitions are separate from runtime snapshots

The Agent subsystem SHALL define a source-neutral `AgentDefinition` contract
and compile both programmatic definitions and Agent.md documents into immutable
`AgentApplicationSnapshot` values.

#### Scenario: Programmatic definition is compiled

- **WHEN** a trusted host supplies an `AgentDefinition`
- **THEN** the compiler SHALL validate it and assign source identity, digest, and registry generation

#### Scenario: Agent.md is compiled

- **WHEN** the registry loads an Agent.md document
- **THEN** parsing SHALL produce the same `AgentDefinition` contract
- **AND** use the same validation and snapshot construction path

### Requirement: Programmatic and file-defined Agents have standard feature parity

Equivalent programmatic and file-defined Agents SHALL use the same
AgentSupervisor, Runtime factory, capability narrowing, and permission paths.

#### Scenario: Equivalent definitions are spawned

- **WHEN** two equivalent definitions use different authoring sources
- **THEN** their effective capabilities SHALL differ only by declared definition or Host configuration

#### Scenario: Programmatic definition requests a denied capability

- **WHEN** a programmatic definition requests a Tool denied by the Host or parent process
- **THEN** capability derivation SHALL preserve monotonic narrowing
- **AND** programmatic origin SHALL not bypass PermissionManager

### Requirement: Mutable runtime state is Agent Host scoped

Every mutable facility that affects runtime behavior SHALL belong to one Agent
Host. Shared module-level values MUST be immutable or behaviorally stateless.

#### Scenario: Two Hosts run in one Node.js process

- **WHEN** two Hosts use different projects, settings, Sessions, and definitions
- **THEN** commands and events in one Host SHALL not expose or mutate the other
- **AND** shutting down one Host SHALL release only its owned resources

### Requirement: Execution attribution distinguishes Agent Host instances

Kernel Execution Context SHALL include immutable Host identity together with
Agent Process and Session attribution.

#### Scenario: Process identifiers collide across Hosts

- **WHEN** two Hosts contain otherwise equivalent process or Session identifiers
- **THEN** Kernel attribution and scoped storage SHALL distinguish them by Host identity

#### Scenario: Agent Runtime binds context

- **WHEN** a Host starts a Main Agent or SubAgent Runtime
- **THEN** the runtime entry SHALL bind Host and Agent Process identity
- **AND** downstream Drivers SHALL read it through the Kernel ABI

### Requirement: Process-wide side effects belong to the CLI adapter

The reusable Agent Host MUST NOT install process signal handlers, call
`process.exit()`, mutate `process.cwd()`, or write runtime changes to
`process.env`.

#### Scenario: Project workspace changes

- **WHEN** an Application command switches the Host project
- **THEN** Host-scoped stores and Execution Context defaults SHALL update
- **AND** the Node.js process working directory SHALL remain unchanged

#### Scenario: Embedded Host shuts down

- **WHEN** an in-process consumer shuts down a Host
- **THEN** the Host SHALL release only its resources
- **AND** SHALL not terminate the embedding process

### Requirement: Agent Host lifecycle is explicit and idempotent

The standard composition function SHALL return a Host with explicit identity,
state, initialize, start, shutdown, interaction binding, and API access.

#### Scenario: Host is shut down repeatedly

- **WHEN** shutdown is requested more than once
- **THEN** every call SHALL complete without duplicate resource termination
- **AND** the Host SHALL remain stopped

#### Scenario: Host startup fails

- **WHEN** a required dependency cannot initialize
- **THEN** startup SHALL reject with a structured failure
- **AND** already acquired Host resources SHALL be released without exiting the process

### Requirement: SDK candidate contracts remain implementation neutral

Application commands, queries, events, lifecycle methods, Agent definitions, and snapshots SHALL use owner-defined values and ports rather than concrete
Manager, Registry, Driver, storage, or Presentation classes.

#### Scenario: Future SDK wrapper consumes the Host

- **WHEN** an SDK adapter wraps the standard Agent Host
- **THEN** it SHALL delegate through Application and lifecycle contracts
- **AND** SHALL not require Harness internals or Presentation implementations
