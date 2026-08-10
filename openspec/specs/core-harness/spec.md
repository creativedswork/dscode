# core-harness Specification

## Purpose

Define the Headless Agent Host composition boundary and runtime configuration
application contract.

## Requirements

### Requirement: Harness is a Headless Application coordinator

`Harness` SHALL coordinate Application lifecycle and use cases while exposing
only `HarnessAPI` to UI and SDK adapters. `createStandardAgentHost()` in
Bootstrap SHALL assemble concrete runtime owners. Harness SHALL NOT select a UI
backend, install process signal handlers, change process cwd, or expose internal
Manager objects through `HarnessAPI`.

#### Scenario: CLI selects the presentation adapter

- **WHEN** CLI bootstrap creates an Agent Host
- **THEN** `createStandardAgentHost()` SHALL assemble the concrete owners and Harness
- **AND** CLI bootstrap SHALL choose TUI or Web presentation
- **AND** both adapters SHALL consume `HarnessAPI`

#### Scenario: Headless Host starts without Presentation

- **WHEN** a trusted caller initializes a standard Host without TUI or Web
- **THEN** Harness SHALL coordinate Application lifecycle without importing Presentation

### Requirement: Runtime configuration has one immutable snapshot owner

The persisted settings files SHALL remain the configuration SSoT.
`RuntimeConfigStore` SHALL own the current immutable runtime snapshot.
`Harness` MAY expose a read-only getter backed by that store but SHALL NOT keep
a second writable configuration mirror.

#### Scenario: Successful setting change

- **WHEN** a `SettingsService` command resolves and validates a new snapshot
- **THEN** `RuntimeConfigStore` SHALL replace the current snapshot atomically
- **AND** runtime owners SHALL apply the snapshot through the single
  `onApplied` transaction
- **AND** `config:change` SHALL be emitted only after apply succeeds

#### Scenario: Failed setting change

- **WHEN** validation or a runtime owner apply step fails
- **THEN** `RuntimeConfigStore` SHALL restore the previous snapshot
- **AND** `config:change` SHALL NOT be emitted

### Requirement: Project switching is transactional

`ProjectCoordinator` SHALL block new Main Agent turns, quiesce an active turn,
prepare the target runtime, and update MCP, Session, Memory, Process,
Application, Main Process, Skill, and runtime configuration owners as one
transaction.

#### Scenario: Partial project switch failure

- **WHEN** any owner fails after an earlier owner has committed target state
- **THEN** committed owners SHALL be compensated in reverse order
- **AND** the previous runtime snapshot and project routing SHALL be restored
- **AND** new Main Agent turns SHALL remain blocked until rollback completes

### Requirement: Harness publishes events instead of calling Presentation

Harness and its coordinators SHALL publish LLM, Tool, Turn, Session, Config,
MCP, Agent Process, and UI notification events through `HarnessEventBus`.
Presentation adapters SHALL subscribe through `HarnessAPI.events`.

#### Scenario: Runtime configuration changes

- **WHEN** a configuration transaction commits
- **THEN** Harness SHALL publish one `config:change` event
- **AND** SHALL NOT invoke a Web or TUI callback directly

### Requirement: Host initialization releases partial resources

Agent Host initialization and start SHALL release Harness, Integration,
managed-service, checkpoint, image, MCP, Agent Process, and App Host resources
when any initialization stage fails.

#### Scenario: Initialization throws

- **WHEN** `initialize()` throws after one or more resources were acquired
- **THEN** shutdown SHALL be invoked exactly once through the idempotent release
  path
- **AND** the Host state SHALL become `failed`
- **AND** a later `shutdown()` SHALL remain safe
