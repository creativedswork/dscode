## ADDED Requirements

### Requirement: HarnessAPI exposes execution episode snapshots
HarnessAPI SHALL expose a read-only current execution episode snapshot for a Plan or
Session. The snapshot SHALL include identity, phase, policy limits, counters, accepted
progress, reflection use, and any bounded incident summary.

#### Scenario: Consumer reads a running episode
- **WHEN** an adapter requests the current snapshot during approved Plan execution
- **THEN** HarnessAPI returns the authoritative running episode without exposing mutable monitor internals

#### Scenario: No episode exists
- **WHEN** an adapter requests a snapshot for a direct, planning-only, or legacy Session with no episode
- **THEN** HarnessAPI returns no episode without synthesizing a running state

#### Scenario: Consumer reads a paused episode
- **WHEN** an adapter requests a snapshot after an inconclusive pause
- **THEN** HarnessAPI returns the persisted pause reason, accepted progress, and available recovery actions

### Requirement: HarnessAPI exposes narrow episode recovery commands
HarnessAPI SHALL expose typed `adjustPlan` and `continueExecution` commands for a
paused episode. Each command MUST include a command ID, owning Plan identity,
expected version, revision, and digest, and MUST return either an idempotent receipt
or a typed conflict.

#### Scenario: Continue command is current
- **WHEN** a caller submits a valid continue command for the current paused snapshot
- **THEN** HarnessAPI returns the new episode snapshot and a durable command receipt

#### Scenario: Recovery command conflicts
- **WHEN** expected version, revision, digest, ownership, or phase does not match
- **THEN** HarnessAPI rejects the mutation and returns the current authoritative snapshot

#### Scenario: Adapter attempts a general episode mutation
- **WHEN** a caller tries to set counters, progress, phase, or completion directly
- **THEN** HarnessAPI exposes no operation that permits that mutation
