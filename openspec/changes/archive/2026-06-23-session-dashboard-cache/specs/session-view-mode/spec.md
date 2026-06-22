## MODIFIED Requirements

### Requirement: Switch to Dashboard mode
When the user selects "Dashboard" from the View Mode dropdown, the main content area SHALL render `ArtifactContainer` instead of `ChatView`.

#### Scenario: Switch to Dashboard mode
- **WHEN** the user selects "Dashboard" from the View Mode dropdown
- **THEN** the main content area renders `ArtifactContainer` instead of `ChatView`
- **AND** the frontend checks the dashboard cache for the current session; if a valid cache entry exists (contentHash matches), it renders the cached HTML instantly; otherwise it sends `{ "type": "artifact", "action": "generate", "context": "session_dashboard" }`

## ADDED Requirements

### Requirement: Session switch resets view mode to chat
When the current session changes to a different session ID while `viewMode` is `"dashboard"`, the frontend SHALL reset `viewMode` to `"chat"`.

#### Scenario: Dashboard mode reset on session switch
- **WHEN** `currentSessionId` changes to a new value
- **AND** `viewMode` is `"dashboard"`
- **THEN** `viewMode` is set to `"chat"`
- **AND** the main content area renders `ChatView` with the new session's messages

#### Scenario: Session switch from chat stays in chat
- **WHEN** `currentSessionId` changes to a new value
- **AND** `viewMode` is `"chat"`
- **THEN** `viewMode` remains `"chat"`

#### Scenario: First session assignment does not trigger mode switch
- **WHEN** the app first receives a sessions event and `currentSessionId` transitions from `null` to a value
- **AND** `viewMode` is `"dashboard"` (unlikely, but defensive)
- **THEN** `viewMode` SHALL NOT be reset to `"chat"` (no spurious switch on first load)
