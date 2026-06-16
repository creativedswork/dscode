## ADDED Requirements

### Requirement: SessionManager subscribes to turn events for timer

The `SessionManager` SHALL accept a `HarnessEventBus` instance (via constructor or setter) and subscribe to `turn:start` and `turn:end` events for active timer management. It SHALL NOT rely on Harness calling `startActiveTimer()` / `stopActiveTimer()` directly.

#### Scenario: turn:start starts active timer

- **WHEN** SessionManager receives `{ type: "turn:start" }`
- **THEN** it SHALL call `this.startActiveTimer()` internally

#### Scenario: turn:end stops active timer

- **WHEN** SessionManager receives `{ type: "turn:end" }`
- **THEN** it SHALL call `this.stopActiveTimer()` internally

#### Scenario: Timer tracks per-turn active time

- **WHEN** SessionManager receives `turn:start` followed later by `turn:end`
- **THEN** the elapsed time between the two events SHALL be added to the session's active duration

### Requirement: SessionManager subscribes to session lifecycle for persistence

The `SessionManager` SHALL subscribe to `turn:end` to trigger session saving, replacing the current pattern where Harness calls `this.sessionManager.trySaveSession(this.agent)` directly.

#### Scenario: Session saved on turn:end

- **WHEN** SessionManager receives `{ type: "turn:end", stopReason, usage }`
- **THEN** it SHALL call `this.trySaveSession(harness.agent)` to persist the session state
