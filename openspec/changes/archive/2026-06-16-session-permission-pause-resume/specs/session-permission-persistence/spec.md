## ADDED Requirements

### Requirement: Session metadata stores pending permission state
`SessionMetadata` SHALL include an optional `pendingPermission` field that stores the tool permission information when a session is interrupted during a permission prompt. The field SHALL be `undefined` when no permission is pending.

#### Scenario: Pending permission saved on session switch
- **WHEN** a user switches sessions while a tool permission prompt is active (i.e., `WebUiBackend.permissionResolve` is non-null)
- **THEN** the current session is saved with `pendingPermission` containing `{ toolName, preview, fuzzyPattern, permissionArgs }` in its metadata
- **AND** the last partial assistant message (the one that requested the tool permission) is rolled back from the saved messages so the conversation history remains clean

#### Scenario: No pending permission in normal save
- **WHEN** a session is saved without an active permission prompt
- **THEN** `pendingPermission` SHALL be `undefined` in the session metadata

### Requirement: Session load restores pending permission frontend state
When a session with `pendingPermission` in its metadata is loaded (via sidebar click or `/session load`), the `sessions` WebSocket event SHALL include the `pendingPermission` field in that session's `SessionInfo`. The frontend SHALL detect this field and automatically render the PermissionDialog.

#### Scenario: Sessions event includes pendingPermission
- **WHEN** `pushSessionList` is called after loading a session that has `pendingPermission` in its metadata
- **THEN** the `sessions` event's `data` array includes the current session with a `pendingPermission` object containing at least `toolName` and `preview`

#### Scenario: Frontend auto-shows PermissionDialog
- **WHEN** the frontend receives a `sessions` event where the session matching `currentSessionId` has a `pendingPermission` field
- **THEN** the frontend SHALL render the PermissionDialog component with the stored `toolName`, `preview`, and `fuzzyPattern`
- **AND** the dialog behavior (allow/deny/always allow) SHALL work identically to the normal permission flow

#### Scenario: Pending permission cleared on deny
- **WHEN** the user denies the restored permission prompt
- **THEN** the backend SHALL save the session with `pendingPermission` set to `undefined`
- **AND** the conversation history remains unchanged (no partial assistant message added back)

#### Scenario: Pending permission cleared on allow
- **WHEN** the user allows the restored permission prompt
- **THEN** the backend SHALL pre-approve the tool via session grant and re-trigger the agent from the last user message
- **AND** save the session with `pendingPermission` set to `undefined`
