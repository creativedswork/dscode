## MODIFIED Requirements

### Requirement: Session list event includes processing state
The `sessions` server-to-client event SHALL include an optional `isProcessing: boolean` field indicating whether the agent is currently processing a turn. The `currentSessionId` field SHALL accurately reflect the current session identifier managed by `SessionManager`, and SHALL be sent every time the `sessions` event is emitted.

#### Scenario: sessions event with processing true
- **WHEN** the server emits a `sessions` event and the agent is currently processing a turn
- **THEN** the event SHALL include `isProcessing: true`

#### Scenario: sessions event with processing false
- **WHEN** the server emits a `sessions` event and the agent is not processing
- **THEN** the event SHALL include `isProcessing: false`

#### Scenario: currentSessionId always present
- **WHEN** the server emits a `sessions` event after any session state change (list, save, load, delete)
- **THEN** the event SHALL include `currentSessionId` reflecting the active session ID from `SessionManager`, or `undefined` if no session is active
