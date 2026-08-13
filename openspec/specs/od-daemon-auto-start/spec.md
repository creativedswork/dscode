# od-daemon-auto-start Specification

## Purpose
TBD - created by archiving change add-open-design-daemon-auto-start. Update Purpose after archive.
## Requirements
### Requirement: --with-od CLI flag
The CLI SHALL continue accepting `--with-od` as a compatibility runtime override that enables the `open-design` integration and requests auto-start for the current invocation. The flag MUST NOT become a second persistent configuration source.

#### Scenario: --with-od flag is parsed
- **WHEN** the user runs `dscode --with-od`
- **THEN** argument parsing SHALL add an `open-design` enable/auto-start integration override
- **AND** all other flags (`--web`, `--web-port`, `--debug`, `--cwd`) SHALL remain unaffected

#### Scenario: --with-od flag is absent
- **WHEN** the user runs `dscode` without `--with-od`
- **THEN** Open Design enablement and auto-start SHALL come from typed integration configuration
- **AND** absence of the flag SHALL NOT disable an integration enabled in configuration

#### Scenario: --with-od combined with --web
- **WHEN** the user runs `dscode --with-od --web`
- **THEN** the Open Design integration SHALL be prepared and the Web UI backend SHALL be initialized
- **AND** the two flags SHALL remain independent

### Requirement: Open Design daemon auto-start
When the enabled Open Design integration requests auto-start, the system SHALL compile its validated configuration into a managed-service specification and delegate startup to ServiceSupervisor. Open Design-specific startup behavior MUST NOT be implemented directly in `src/bootstrap/cli-main.ts`.

#### Scenario: Daemon spawns from typed integration configuration
- **WHEN** `integrations.openDesign` is enabled with a valid repository path and `autoStart: true`
- **THEN** the integration SHALL request a daemon command containing `"--port"`, the configured port, and `"--no-open"`
- **AND** ServiceSupervisor SHALL own the spawned child process
- **AND** child output SHALL be routed through the scoped service logger

#### Scenario: Configured port overrides default port
- **WHEN** `integrations.openDesign.port` is `9999`
- **THEN** the health check SHALL target `http://127.0.0.1:9999/api/projects`
- **AND** the spawn environment SHALL include `OD_PORT=9999`

#### Scenario: Port defaults to 7456
- **WHEN** the typed integration configuration and migration fallback omit a port
- **THEN** the health check SHALL target `http://127.0.0.1:7456/api/projects`

#### Scenario: Integration path is unavailable
- **WHEN** Open Design auto-start is requested without a valid configured path
- **THEN** the integration SHALL emit a configuration diagnostic
- **AND** dscode SHALL continue startup without spawning the daemon

#### Scenario: Daemon is already running
- **WHEN** the Open Design health probe succeeds before spawn
- **THEN** ServiceSupervisor SHALL treat the daemon as externally managed
- **AND** dscode SHALL NOT spawn or claim ownership of it

#### Scenario: Daemon starts without opening browser
- **WHEN** the Open Design integration resolves its daemon command
- **THEN** the command SHALL include `--no-open`
- **AND** the Open Design daemon SHALL NOT automatically open a browser window

#### Scenario: Integration is enabled without auto-start
- **WHEN** `integrations.openDesign.enabled` is true and `autoStart` is false
- **THEN** the integration SHALL contribute its MCP configuration
- **AND** dscode SHALL NOT spawn an Open Design daemon

### Requirement: Daemon health check polling
The Open Design integration SHALL declare `http://127.0.0.1:<port>/api/projects` as its readiness probe and ServiceSupervisor SHALL apply bounded health polling before integration preparation completes.

#### Scenario: Daemon becomes healthy within timeout
- **WHEN** the readiness endpoint responds with HTTP 200 within 30 seconds
- **THEN** the service SHALL be reported healthy
- **AND** dscode SHALL proceed with Harness initialization

#### Scenario: Daemon health check times out
- **WHEN** the readiness endpoint does not respond with HTTP 200 within 30 seconds
- **THEN** the system SHALL emit an Open Design health-timeout diagnostic
- **AND** dscode SHALL proceed with Harness initialization

#### Scenario: Health check polling interval
- **WHEN** Open Design readiness polling begins
- **THEN** ServiceSupervisor SHALL poll no more frequently than every 500 milliseconds

