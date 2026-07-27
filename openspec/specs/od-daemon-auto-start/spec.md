# od-daemon-auto-start Specification

## Purpose
TBD - created by archiving change add-open-design-daemon-auto-start. Update Purpose after archive.
## Requirements
### Requirement: --with-od CLI flag
The CLI SHALL accept a `--with-od` flag that triggers automatic startup of the Open Design daemon before the main harness initializes.

#### Scenario: --with-od flag is parsed
- **WHEN** the user runs `dscode --with-od`
- **THEN** `parseArgs()` SHALL return `{ withOd: true }`
- **AND** all other flags (`--web`, `--web-port`, `--debug`, `--cwd`) SHALL remain unaffected

#### Scenario: --with-od flag is absent
- **WHEN** the user runs `dscode` without `--with-od`
- **THEN** `parseArgs()` SHALL return `{ withOd: false }`
- **AND** no Open Design daemon SHALL be spawned

#### Scenario: --with-od combined with --web
- **WHEN** the user runs `dscode --with-od --web`
- **THEN** both the Open Design daemon SHALL start AND the Web UI backend SHALL be initialized
- **AND** the two flags SHALL be independent (neither implies the other)

### Requirement: Open Design daemon auto-start
When `--with-od` is passed, the system SHALL read `OPEN_DESIGN_DIR` from the environment, spawn the Open Design daemon as a child process with `--no-open` flag, and wait for it to become healthy.

#### Scenario: Daemon spawns from configured directory
- **WHEN** `OPEN_DESIGN_DIR` is set to a valid Open Design repository path
- **THEN** the system SHALL spawn the daemon with args that include `"--port"`, the configured port, and `"--no-open"`
- **AND** the child process SHALL inherit the parent's `stdio`

#### Scenario: OD_PORT overrides default port
- **WHEN** `OD_PORT` is set to `9999`
- **THEN** the health check SHALL target `http://127.0.0.1:9999/health`
- **AND** the spawn SHALL pass `OD_PORT=9999` in the child's environment

#### Scenario: OD_PORT defaults to 7456
- **WHEN** `OD_PORT` is not set
- **THEN** the health check SHALL target `http://127.0.0.1:7456/health`

#### Scenario: OPEN_DESIGN_DIR is not set
- **WHEN** `OPEN_DESIGN_DIR` is empty or undefined and `--with-od` is passed
- **THEN** the system SHALL print a warning `OPEN_DESIGN_DIR is not set. Create a .env file from .env.example`
- **AND** dscode SHALL continue startup without spawning the daemon

#### Scenario: Daemon starts without opening browser
- **WHEN** the daemon is spawned with `--no-open` flag
- **THEN** the Open Design daemon SHALL NOT automatically open a browser window after becoming healthy
- **AND** dscode SHALL continue startup normally via MCP integration with the daemon

### Requirement: Daemon health check polling
The system SHALL poll the daemon's health endpoint until it responds with HTTP 200, then proceed with startup.

#### Scenario: Daemon becomes healthy within timeout
- **WHEN** the daemon starts responding with HTTP 200 within 30 seconds
- **THEN** the system SHALL print `Open Design daemon ready on port {port}`
- **AND** dscode SHALL proceed with `Harness.initialize()` and normal startup

#### Scenario: Daemon health check times out
- **WHEN** the daemon does not respond with HTTP 200 within 30 seconds
- **THEN** the system SHALL print a warning `Open Design daemon did not become healthy within 30s`
- **AND** dscode SHALL proceed with startup (the daemon child process remains running if it eventually starts)

#### Scenario: Health check polling interval
- **WHEN** the health check loop begins
- **THEN** the system SHALL poll at most every 500ms

