# settings-service-boundary Specification

## Purpose

Define persistent configuration as the single source of truth, owner-specific
validation, immutable runtime snapshots, and transactional project switching.

## Requirements

### Requirement: Configuration files remain the persistent single source of truth

Settings files SHALL remain authoritative across process restarts.
`SettingsRepository` SHALL load and safely patch scoped files while preserving
unrelated keys.

#### Scenario: Project setting is updated

- **WHEN** an Application command changes a project permission or disabled Skill
- **THEN** the project `settings.json` SHALL be patched atomically
- **AND** unrelated project and user settings SHALL remain unchanged

#### Scenario: Runtime state changes

- **WHEN** a setting is applied to the running Host
- **THEN** the runtime snapshot SHALL be derived from validated persistent configuration
- **AND** SHALL not become a second persistent source

### Requirement: Feature owners resolve typed configuration

Each feature or integration SHALL own its schema, merge policy, defaults,
validation, compatibility inputs, and diagnostics.

#### Scenario: Open Design configuration is loaded

- **WHEN** scoped settings contain `integrations.openDesign`
- **THEN** the Open Design owner SHALL merge and validate its typed configuration
- **AND** generic Config contracts SHALL not declare Open Design fields

#### Scenario: Another production integration is added

- **WHEN** a second integration introduces independent configuration
- **THEN** it SHALL own and expose its resolver to Bootstrap
- **AND** a shared Integration SPI SHALL be introduced only when production reuse justifies it

### Requirement: Settings mutations use typed Application commands

Presentation adapters and domain services SHALL request settings mutations
through typed Application commands or injected owner ports.

#### Scenario: API key is updated from TUI or Web

- **WHEN** either adapter submits an API-key update
- **THEN** the same command SHALL validate, persist, apply, and notify
- **AND** both adapters SHALL observe the same masked snapshot

#### Scenario: Permission rule is persisted

- **WHEN** PermissionManager receives a saveable rule
- **THEN** it SHALL call an injected permission-policy persistence port
- **AND** SHALL not import configuration I/O

### Requirement: Runtime configuration snapshots are immutable

`RuntimeConfigStore` SHALL own immutable runtime snapshots. Public queries SHALL
return masked projections and MUST NOT expose raw secrets or mutable backing
objects.

#### Scenario: UI reads configuration

- **WHEN** Presentation requests current settings
- **THEN** HarnessAPI SHALL return an immutable masked snapshot
- **AND** SHALL not expose RuntimeConfigStore or SettingsRepository

#### Scenario: Configuration changes

- **WHEN** a validated settings transaction succeeds
- **THEN** the store SHALL publish one new snapshot and one change event
- **AND** previous snapshots SHALL remain unchanged

### Requirement: Project switching reloads configuration transactionally

The project-switch Application use case SHALL prepare project settings, MCP,
integration, Session, Memory, Process, Agent definition, Skill, and runtime
owners before committing one target project state.

#### Scenario: Project switch succeeds

- **WHEN** a valid target project is selected
- **THEN** all project-scoped owners SHALL observe one committed target snapshot
- **AND** state events SHALL be published after commit

#### Scenario: Project-scoped reload fails

- **WHEN** a required prepare or commit step fails
- **THEN** committed owners SHALL be compensated
- **AND** Presentation SHALL not observe a partially switched runtime
