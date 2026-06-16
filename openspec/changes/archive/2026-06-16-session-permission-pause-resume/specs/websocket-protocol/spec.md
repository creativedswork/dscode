## MODIFIED Requirements

### Requirement: sessions event carries pending permission state
The `sessions` server event SHALL include an optional `pendingPermission` field in each `SessionInfo` object. When a session has a pending tool permission that was interrupted by a session switch, this field SHALL contain `{ toolName: string; preview: string; fuzzyPattern?: string | null }`. When no permission is pending, the field SHALL be `undefined` or absent.

#### Scenario: sessions event with pending permission
- **WHEN** the server sends a `sessions` event and the current session has `pendingPermission` in its metadata
- **THEN** the event's `data` array SHALL include that session's `SessionInfo` with `pendingPermission: { toolName: "...", preview: "...", fuzzyPattern: "..." }`

#### Scenario: sessions event without pending permission
- **WHEN** the server sends a `sessions` event and no session has `pendingPermission`
- **THEN** each `SessionInfo` in `data` SHALL have `pendingPermission` as `undefined` or the field absent

#### Scenario: pendingPermission removed after resolution
- **WHEN** the user resolves the pending permission (allow or deny) and the server re-saves the session
- **THEN** subsequent `sessions` events SHALL NOT include `pendingPermission` for that session
