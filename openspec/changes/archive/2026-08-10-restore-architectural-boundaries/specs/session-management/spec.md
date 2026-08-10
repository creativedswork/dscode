## MODIFIED Requirements

### Requirement: Session load saves current session first
The unified Application Session-switch command SHALL own target preflight, active-turn
quiescence, source Session save, pending-permission capture, Main Process rebind, target
commit, and result publication. Web and TUI adapters MUST NOT directly coordinate
SessionManager, Agent Runtime, or AgentSupervisor.

#### Scenario: Load aborts and waits for a running turn
- **WHEN** a Session-switch command targets a valid Session while Main is running
- **THEN** the Application SHALL abort and await Main quiescence before saving the source
- **AND** Presentation SHALL await the command result

#### Scenario: Source Session is saved
- **WHEN** target preflight succeeds
- **THEN** the Application SHALL save the source Session before target commit
- **AND** it SHALL preserve the documented rollback behavior on rebind or commit failure

#### Scenario: Pending permission is present
- **WHEN** Session switch is requested during an interactive permission prompt
- **THEN** the UserInteraction adapter SHALL supply structured PendingPermission
- **AND** the Application transaction SHALL persist it without reading Web/TUI private state

#### Scenario: Load completes
- **WHEN** source save, Main Process rebind, and target commit all succeed
- **THEN** the command SHALL return the target Session snapshot once
- **AND** Presentation SHALL clear/replay conversation and refresh lists from that result

### Requirement: handleSession load fallback to current session
Session target resolution SHALL be implemented by the Session query/Application
switch use case. It SHALL consider the current Session together with project and
bounded global indexes, while Presentation adapters only submit the requested ID or
prefix.

#### Scenario: Current empty Session is requested
- **WHEN** the requested prefix uniquely matches the current Session even though it is
  absent from filtered list results
- **THEN** the Application resolver SHALL select the current Session
- **AND** Web/TUI SHALL not implement a private fallback

#### Scenario: Target is ambiguous
- **WHEN** a prefix resolves to multiple distinct Session IDs
- **THEN** the command SHALL fail before aborting or saving current state
- **AND** Presentation SHALL render the typed error result

## ADDED Requirements

### Requirement: Session queries return snapshots rather than managers
HarnessAPI SHALL expose Session list, metadata, persisted snapshot, and switch results
through read-only query/command contracts. Presentation and Eval MUST NOT receive
SessionManager or SessionStore.

#### Scenario: UI lists Sessions
- **WHEN** TUI or Web requests Session navigation data
- **THEN** the query SHALL return immutable Session summary snapshots
- **AND** the UI SHALL not call `listSessions()` on a concrete Manager

#### Scenario: Eval reads a historical Session
- **WHEN** Eval targets a persisted Session
- **THEN** an Eval/Session query port SHALL return the required raw domain snapshot
- **AND** Eval SHALL not access SessionStore internals
