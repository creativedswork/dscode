## ADDED Requirements

### Requirement: WebSocket protocol carries authoritative episode state
The server SHALL serialize execution episode snapshots and impasse events from
HarnessEventBus to WebSocket clients. Clients MUST NOT derive episode phase from
streaming silence, processing timers, connection state, or local Tool counts.

#### Scenario: Episode transitions to reflection
- **WHEN** HarnessEventBus emits a reflecting episode snapshot
- **THEN** connected clients receive the typed snapshot with the same episode and Plan identities

#### Scenario: Client reconnects to a paused Session
- **WHEN** a client reconnects after an episode became `paused_inconclusive`
- **THEN** the ready or Session synchronization payload includes the persisted paused snapshot

#### Scenario: Legacy Session has no episode
- **WHEN** a Session predates episode state or did not execute an approved Plan
- **THEN** synchronization omits the optional snapshot without failing the connection

### Requirement: WebSocket protocol accepts explicit episode recovery commands
The protocol SHALL accept typed adjust-plan and continue-execution commands carrying
command ID, Plan identity, expected version, revision, and digest. The server SHALL
return typed success receipts or conflicts and MUST NOT resume execution merely
because a client reconnects.

#### Scenario: User continues from Web
- **WHEN** the client sends a valid continue-execution command for a paused episode
- **THEN** the server delegates to HarnessAPI and broadcasts the resulting running snapshot

#### Scenario: Duplicate command is redelivered
- **WHEN** transport retry sends the same command ID and payload again
- **THEN** the server returns the original receipt without creating another episode

#### Scenario: Stale command is sent
- **WHEN** the command does not match the current Plan version, revision, or digest
- **THEN** the server returns a typed conflict with the current episode snapshot
