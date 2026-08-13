## ADDED Requirements

### Requirement: Configuration files remain the persistent single source of truth
The system SHALL expose a `SettingsRepository` port for loading and safely patching
user and project configuration scopes. CLI, TUI, Web, Permission, and Integration
code MUST NOT create independent persistent configuration stores.

#### Scenario: Project setting is updated
- **WHEN** an Application command changes a project-scoped permission or disabled Skill
- **THEN** the SettingsRepository SHALL patch the project `settings.json`
- **AND** unrelated keys and user-scoped settings SHALL remain unchanged

#### Scenario: Runtime state changes
- **WHEN** a setting is applied to the running process
- **THEN** the persisted file SHALL remain the authoritative source for the next process
- **AND** the in-memory snapshot SHALL be derived from validated persisted configuration

### Requirement: Feature owners resolve typed configuration
Each feature or Integration SHALL own the schema, merge policy, validation, defaults,
compatibility inputs, and diagnostics for its configuration namespace. The generic
SettingsRepository SHALL expose raw scoped values and MUST NOT know feature-specific
fields.

#### Scenario: Open Design configuration is loaded
- **WHEN** scoped settings contain `integrations.openDesign`
- **THEN** OpenDesignIntegration's resolver SHALL merge and validate its typed config
- **AND** neither Core config types nor SettingsRepository SHALL declare Open Design fields

#### Scenario: New Integration is installed
- **WHEN** a second Integration introduces a configuration namespace
- **THEN** it SHALL register or invoke its own resolver through IntegrationRegistry
- **AND** Core configuration loading SHALL require no Integration-specific branch

### Requirement: Settings mutations use typed Application commands
Presentation adapters and domain services SHALL request settings changes through typed
Application commands or narrow persistence ports. They MUST NOT call filesystem helpers,
mutate a shared config object, or set process environment variables directly.

#### Scenario: API key is updated from TUI or Web
- **WHEN** either Presentation adapter submits the API-key command
- **THEN** the same Application settings command SHALL validate, persist, apply, and notify
- **AND** both adapters SHALL observe the same outcome and masked snapshot

#### Scenario: Permission rule is persisted
- **WHEN** PermissionManager receives a saveable rule decision
- **THEN** it SHALL call an injected permission-policy persistence port
- **AND** it SHALL not import Core configuration I/O

### Requirement: Runtime configuration snapshots are immutable
The Application SHALL publish immutable runtime configuration snapshots. Consumers MUST
NOT receive the mutable backing object or a mutation-capable store.

#### Scenario: UI reads configuration
- **WHEN** a Presentation query requests current configuration
- **THEN** it SHALL receive a public immutable snapshot with secrets masked
- **AND** it SHALL not receive `ConfigWatch`, SettingsRepository, or raw API keys

#### Scenario: Configuration changes
- **WHEN** a validated settings command succeeds
- **THEN** the system SHALL create a new runtime snapshot and publish one change event
- **AND** prior snapshots SHALL remain unchanged

### Requirement: Project switching reloads configuration transactionally
The project-switch Application use case SHALL reload project-scoped settings, MCP
definitions, Integrations, Skills, Sessions, and process context through their owners.
Presentation adapters MUST only submit the command and render its result.

#### Scenario: Project switch succeeds
- **WHEN** a valid target project is selected
- **THEN** all project-scoped components SHALL observe one committed target snapshot
- **AND** the Application SHALL publish configuration and resource state after commit

#### Scenario: Project-scoped reload fails
- **WHEN** a required reload step fails before commit
- **THEN** the Application SHALL report an error without exposing a partially updated
  runtime configuration to Presentation
