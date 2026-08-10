## ADDED Requirements

### Requirement: Typed Open Design integration settings
The system SHALL load Open Design configuration from `integrations.openDesign` in scoped `settings.json` files and SHALL validate `enabled`, `path`, `port`, and `autoStart` before preparing the integration.

#### Scenario: Valid user configuration is loaded
- **WHEN** user `settings.json` contains a valid `integrations.openDesign` object
- **THEN** `loadConfig()` SHALL expose an immutable typed Open Design integration configuration

#### Scenario: Project fields override user fields
- **WHEN** user and project settings both define Open Design integration fields
- **THEN** project fields SHALL override matching user fields
- **AND** unspecified user fields SHALL remain available through a field-level merge

#### Scenario: Port is omitted
- **WHEN** Open Design integration configuration omits `port`
- **THEN** the normalized port SHALL be `7456`

#### Scenario: Configuration is invalid
- **WHEN** the integration path is empty, the port is outside `1..65535`, or a field has an invalid type
- **THEN** configuration loading SHALL produce a diagnostic
- **AND** Open Design auto-start SHALL not run with the invalid values

### Requirement: Open Design enablement controls integration contribution
The normalized `enabled` and `autoStart` fields SHALL independently control Open Design MCP contribution and daemon ownership behavior.

#### Scenario: Integration is disabled
- **WHEN** `integrations.openDesign.enabled` is false
- **THEN** dscode SHALL neither contribute the Open Design MCP server nor start its daemon

#### Scenario: Integration is enabled and auto-started
- **WHEN** `enabled` and `autoStart` are both true
- **THEN** dscode SHALL contribute the Open Design MCP server
- **AND** it SHALL ask ServiceSupervisor to ensure the daemon is available

#### Scenario: Integration uses externally managed daemon
- **WHEN** `enabled` is true and `autoStart` is false
- **THEN** dscode SHALL contribute the Open Design MCP server
- **AND** it SHALL not start or own the daemon

### Requirement: Environment compatibility fallback
During the migration window, `OPEN_DESIGN_DIR` and `OD_PORT` SHALL provide missing Open Design values only when typed integration configuration is absent. Typed configuration and explicit disablement MUST take precedence.

#### Scenario: Legacy environment configuration is used
- **WHEN** no typed Open Design integration object exists and `OPEN_DESIGN_DIR` is set
- **THEN** dscode SHALL derive a one-run integration configuration from `OPEN_DESIGN_DIR` and optional `OD_PORT`
- **AND** it SHALL emit a deprecation diagnostic
- **AND** it SHALL NOT write the derived values to disk

#### Scenario: Direct CLI uses the legacy project env file
- **WHEN** no typed Open Design integration object exists
- **AND** the process environment does not define `OPEN_DESIGN_DIR`
- **AND** the project `.env` defines `OPEN_DESIGN_DIR` and optional `OD_PORT`
- **THEN** dscode SHALL use those two fields as the one-run compatibility configuration
- **AND** it SHALL NOT import unrelated `.env` fields into the process environment

#### Scenario: Typed configuration takes precedence
- **WHEN** typed Open Design configuration and legacy environment variables are both present
- **THEN** the typed configuration SHALL be used
- **AND** legacy environment values SHALL NOT override it

#### Scenario: Explicit disablement takes precedence
- **WHEN** typed configuration sets `enabled: false` and legacy environment variables are present
- **THEN** the Open Design integration SHALL remain disabled

#### Scenario: Legacy port is invalid
- **WHEN** environment fallback is active and `OD_PORT` is invalid
- **THEN** dscode SHALL emit a diagnostic
- **AND** it SHALL use the default port `7456`

### Requirement: Project env example documents compatibility configuration
The repository `.env.example` SHALL document `OPEN_DESIGN_DIR` and `OD_PORT` as a bounded compatibility path and SHALL identify typed `integrations.openDesign` settings as the recommended persistent configuration.

#### Scenario: User copies the environment example
- **WHEN** a user copies `.env.example` to `.env` and configures the Open Design repository path
- **THEN** `dscode --with-od` SHALL use those values when typed Open Design configuration is absent
- **AND** the example SHALL explain that unrelated `.env` variables are not loaded by this compatibility path

### Requirement: Integration configuration is not mutated during startup
Open Design startup SHALL treat loaded configuration as immutable and SHALL not rewrite settings or environment files.

#### Scenario: Compatibility fallback succeeds
- **WHEN** environment fallback produces a valid one-run configuration
- **THEN** user and project `settings.json` SHALL remain unchanged
- **AND** `.env` and `.env.example` SHALL remain unchanged

#### Scenario: Configuration conflict is detected
- **WHEN** startup detects conflicting Open Design integration and MCP definitions
- **THEN** it SHALL report the conflict without editing either configuration source

## REMOVED Requirements

### Requirement: .env is gitignored
**Reason**: Whether `.env` remains ignored is a repository-wide safety policy rather than an Open Design integration requirement.

**Migration**: No action is required. This change does not require removing `.env` from `.gitignore`.
