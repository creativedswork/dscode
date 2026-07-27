## ADDED Requirements

### Requirement: Daemon child process cleanup on exit
The system SHALL terminate the Open Design daemon child process when dscode shuts down, using a graceful-then-forceful strategy.

#### Scenario: Graceful shutdown via SIGTERM
- **WHEN** dscode exits normally (process.exit) or receives SIGINT/SIGTERM
- **THEN** the system SHALL send SIGTERM to the daemon child process
- **AND** the system SHALL set a 3-second timeout

#### Scenario: Forceful shutdown after timeout
- **WHEN** the daemon child process has not exited within 3 seconds of receiving SIGTERM
- **THEN** the system SHALL send SIGKILL to the daemon child process

#### Scenario: Child process does not block parent exit
- **WHEN** the daemon child process is spawned
- **THEN** the child SHALL be `unref()`ed so it does not prevent the parent process from exiting

### Requirement: Daemon crash detection
The system SHALL detect when the daemon child process exits unexpectedly and log the event.

#### Scenario: Daemon exits with non-zero code
- **WHEN** the daemon child process exits with a non-zero exit code
- **THEN** the system SHALL log `Open Design daemon exited with code {code}`
- **AND** dscode SHALL continue running normally (no restart attempt)

#### Scenario: Daemon exits with signal
- **WHEN** the daemon child process is killed by a signal (e.g., SIGKILL)
- **THEN** the system SHALL log `Open Design daemon killed by signal {signal}`
- **AND** dscode SHALL continue running normally

### Requirement: Future global install command support
The daemon spawn logic SHALL encapsulate command resolution in a function that can later prefer a global `open-design` command over the current `pnpm tools-dev` invocation.

#### Scenario: Command resolution function exists
- **WHEN** the daemon spawn logic is invoked
- **THEN** it SHALL call a `resolveOdCommand(dir: string)` function
- **AND** the function SHALL currently return `{ cmd: "pnpm", args: ["tools-dev", "run", "web"], cwd: dir }`
- **AND** the function SHALL have a placeholder for future global command detection (e.g., `which open-design`)
