## MODIFIED Requirements

### Requirement: Daemon child process cleanup on exit
The Open Design integration SHALL delegate owned daemon cleanup to ServiceSupervisor. Open Design modules MUST NOT register their own process exit, SIGINT, or SIGTERM handlers.

#### Scenario: Graceful application shutdown
- **WHEN** dscode begins normal shutdown with an owned Open Design daemon running
- **THEN** the composition root SHALL invoke integration shutdown
- **AND** ServiceSupervisor SHALL request graceful daemon termination
- **AND** it SHALL wait up to 3 seconds

#### Scenario: Forceful shutdown after timeout
- **WHEN** the owned Open Design daemon has not exited within 3 seconds of graceful termination
- **THEN** ServiceSupervisor SHALL forcefully terminate it

#### Scenario: Externally managed daemon survives shutdown
- **WHEN** the Open Design daemon was already healthy before dscode startup
- **THEN** dscode SHALL treat it as unowned
- **AND** shutdown SHALL NOT signal or terminate it

#### Scenario: Cleanup ownership is centralized
- **WHEN** Open Design integration modules are loaded
- **THEN** they SHALL NOT add module-level `process.on("exit")`, `process.on("SIGINT")`, or `process.on("SIGTERM")` hooks

### Requirement: Daemon crash detection
The system SHALL detect unexpected Open Design daemon exits, log their code or signal, and apply the managed-service restart policy only to an owned daemon.

#### Scenario: Owned daemon exits with non-zero code
- **WHEN** the owned Open Design daemon exits with a non-zero status while dscode is running
- **THEN** ServiceSupervisor SHALL log the exit under service identifier `open-design`
- **AND** it SHALL restart the daemon while the restart budget remains

#### Scenario: Owned daemon exits with signal
- **WHEN** the owned Open Design daemon is killed by a signal while shutdown is not active
- **THEN** ServiceSupervisor SHALL log the terminating signal
- **AND** it SHALL apply the same bounded restart policy as a non-zero exit

#### Scenario: Rapid restart budget is exhausted
- **WHEN** the Open Design daemon exceeds three rapid restarts with less than five seconds between failures
- **THEN** ServiceSupervisor SHALL stop restarting it
- **AND** dscode SHALL continue running with an unavailable Open Design integration

#### Scenario: External daemon disappears
- **WHEN** a daemon classified as externally managed becomes unavailable
- **THEN** dscode SHALL NOT attempt to spawn a replacement under that external process identity
- **AND** MCP reconnection behavior SHALL remain owned by MCPManager

### Requirement: Future global install command support
Open Design daemon command resolution SHALL live in the Open Design integration and remain isolated from generic ServiceSupervisor and `src/core/main.ts`.

#### Scenario: Project-local command exists
- **WHEN** `<open-design-path>/node_modules/.bin/od` exists
- **THEN** command resolution SHALL select that executable
- **AND** it SHALL pass the configured port and `--no-open`

#### Scenario: Project-local command is absent
- **WHEN** the project-local `od` executable does not exist
- **THEN** command resolution SHALL fall back to `pnpm tools-dev run web`
- **AND** it SHALL use the configured Open Design path as cwd

#### Scenario: Command strategy changes in the future
- **WHEN** a later Open Design distribution provides a stable global command
- **THEN** only the Open Design integration command resolver SHALL require modification
- **AND** ServiceSupervisor and the core composition contract SHALL remain unchanged
