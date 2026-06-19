## ADDED Requirements

### Requirement: Session list broadcasts on session deleted event
The server SHALL push the updated session list to all connected WebSocket clients when a session is deleted, via the `session:deleted` event emitted by `SessionManager.deleteSession()`. This mirrors the existing behavior for `session:saved` and `session:created` events.

#### Scenario: Session list updates after session deletion
- **WHEN** a user deletes a session from the sidebar
- **THEN** the server broadcasts a `sessions` event with the updated session list (missing the deleted session) to all connected WebSocket clients

#### Scenario: Session list after current session deletion
- **WHEN** a user deletes the currently active session from the sidebar
- **THEN** the server broadcasts a `sessions` event with `currentSessionId: null` and the updated session list to all connected clients

#### Scenario: Session list after non-current session deletion
- **WHEN** a user deletes a non-current session from the sidebar
- **THEN** the server broadcasts a `sessions` event with the existing `currentSessionId` and the updated session list to all connected clients
