## MODIFIED Requirements

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
