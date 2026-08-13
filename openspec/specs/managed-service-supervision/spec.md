# managed-service-supervision Specification

## Purpose
TBD - created by archiving change decouple-open-design-from-core. Update Purpose after archive.
## Requirements
### Requirement: Declarative managed-service startup
The system SHALL accept trusted internal managed-service specifications that define a service identifier, executable, arguments, working directory, environment, health policy, restart policy, and shutdown grace period. User configuration MUST NOT directly supply arbitrary executable specifications.

#### Scenario: Integration starts a managed service
- **WHEN** an enabled integration compiles validated configuration into a managed-service specification
- **THEN** the ServiceSupervisor SHALL spawn the declared executable with the declared arguments, working directory, and environment
- **AND** it SHALL associate the child process with the declared service identifier

#### Scenario: User settings cannot inject an executable
- **WHEN** user or project settings contain unrecognized command or executable fields under an integration
- **THEN** configuration validation SHALL reject or ignore those fields with a diagnostic
- **AND** the ServiceSupervisor SHALL only receive executable definitions produced by trusted integration code

### Requirement: Explicit external-service ownership
The ServiceSupervisor SHALL distinguish child processes started by dscode from compatible services that were already running before initialization.

#### Scenario: Service is already healthy
- **WHEN** the pre-start health probe succeeds
- **THEN** the ServiceSupervisor SHALL mark the service as externally managed and healthy
- **AND** it SHALL NOT spawn, restart, or terminate that external process

#### Scenario: Service is spawned by dscode
- **WHEN** the pre-start health probe fails and service auto-start is enabled
- **THEN** the ServiceSupervisor SHALL spawn the service and mark the resulting child process as owned

### Requirement: Bounded health readiness
The ServiceSupervisor SHALL poll a configured health probe at the configured interval until it succeeds or reaches its timeout. A health timeout MUST NOT prevent the main Harness from starting.

#### Scenario: Owned service becomes healthy
- **WHEN** the health probe succeeds before the timeout
- **THEN** the ServiceSupervisor SHALL report the service as healthy
- **AND** integration preparation SHALL complete successfully

#### Scenario: Health probe times out
- **WHEN** the health probe does not succeed before the configured timeout
- **THEN** the ServiceSupervisor SHALL report an unhealthy diagnostic
- **AND** dscode SHALL continue normal Harness initialization

#### Scenario: Startup is cancelled
- **WHEN** integration preparation is aborted while health polling is active
- **THEN** the ServiceSupervisor SHALL stop polling promptly
- **AND** it SHALL propagate cancellation without starting another child process

### Requirement: Bounded owned-service restart
The ServiceSupervisor SHALL restart an owned service after an unexpected non-zero exit only while its restart policy permits. It MUST NOT restart services during intentional shutdown, after a normal zero exit, or after the rapid-restart budget is exhausted.

#### Scenario: Owned service crashes within restart budget
- **WHEN** an owned service exits with a non-zero status and its restart budget remains
- **THEN** the ServiceSupervisor SHALL spawn a replacement using the same managed-service specification
- **AND** it SHALL run the configured health probe for the replacement

#### Scenario: Restart loop is detected
- **WHEN** an owned service exceeds its configured rapid-restart count within the configured time window
- **THEN** the ServiceSupervisor SHALL stop restarting it
- **AND** it SHALL emit a restart-budget-exhausted diagnostic

#### Scenario: Shutdown does not restart service
- **WHEN** an owned service exits after ServiceSupervisor shutdown has begun
- **THEN** the ServiceSupervisor SHALL NOT restart it

### Requirement: Centralized owned-service shutdown
The ServiceSupervisor SHALL provide one idempotent asynchronous shutdown operation for all owned services and MUST NOT install module-level process signal handlers.

#### Scenario: Graceful shutdown succeeds
- **WHEN** shutdown begins with an owned service still running
- **THEN** the ServiceSupervisor SHALL request graceful termination
- **AND** it SHALL wait up to the service's configured grace period

#### Scenario: Graceful shutdown times out
- **WHEN** an owned service remains running after its grace period
- **THEN** the ServiceSupervisor SHALL forcefully terminate it

#### Scenario: Shutdown is called twice
- **WHEN** shutdown is invoked more than once
- **THEN** all callers SHALL observe the same completed shutdown outcome
- **AND** no service SHALL receive duplicate restart or termination work

### Requirement: Managed-service observability
The ServiceSupervisor SHALL emit scoped lifecycle diagnostics and route captured child stdout and stderr through the dscode logger without exposing them as Agent messages.

#### Scenario: Child writes diagnostic output
- **WHEN** an owned service writes to stdout or stderr
- **THEN** the output SHALL be recorded under that service identifier
- **AND** it SHALL NOT be injected into Main Agent or SubAgent conversation context

#### Scenario: Spawn fails
- **WHEN** the configured executable or working directory cannot be used
- **THEN** the ServiceSupervisor SHALL emit a structured spawn-failed diagnostic
- **AND** dscode SHALL continue startup unless the caller explicitly treats the integration as required

