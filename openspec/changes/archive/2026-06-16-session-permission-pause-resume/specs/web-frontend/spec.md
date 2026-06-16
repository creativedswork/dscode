## ADDED Requirements

### Requirement: Frontend auto-restores permission dialog from session pendingPermission
The frontend SHALL, upon receiving a `sessions` event, check whether the session matching `currentSessionId` has a `pendingPermission` field. If present, the frontend SHALL automatically render the PermissionDialog component with the stored permission information, regardless of whether a `permission_prompt` event was received.

#### Scenario: PermissionDialog auto-pops on session switch
- **WHEN** the frontend receives a `sessions` event with `currentSessionId: "A"` and session A has `pendingPermission: { toolName: "bash", preview: "ls -la", fuzzyPattern: null }`
- **THEN** the frontend SHALL show the PermissionDialog with toolName "bash" and preview "ls -la"
- **AND** the dialog SHALL have Allow, Always Allow, Save to Settings, Input Idea, and Deny buttons

#### Scenario: PermissionDialog not shown for sessions without pendingPermission
- **WHEN** the frontend receives a `sessions` event where the current session has no `pendingPermission` field
- **THEN** no PermissionDialog is shown (unless a `permission_prompt` event is received separately)

#### Scenario: PermissionDialog clears on session switch away
- **WHEN** the frontend shows a PermissionDialog from a session's `pendingPermission` and the user switches to a different session
- **THEN** the PermissionDialog is dismissed (via `clear_conversation` event as in Plan A)
- **AND** when switching back, the dialog re-appears if `pendingPermission` is still present

### Requirement: PermissionDialog handles restored permission allow
When the user clicks "Allow" on a PermissionDialog restored from `pendingPermission`, the frontend SHALL send a `permission` command with `decision: "allow"` and the stored tool identity. The backend SHALL pre-approve the tool and re-trigger the agent.

#### Scenario: Allow on restored permission
- **WHEN** user clicks "Allow" on a PermissionDialog restored from `pendingPermission: { toolName: "bash", preview: "ls" }`
- **THEN** the frontend SHALL send `{ type: "permission", decision: "allow", toolName: "bash" }` (or equivalent resume command)
- **AND** the PermissionDialog closes

#### Scenario: Deny on restored permission
- **WHEN** user clicks "Deny" on a PermissionDialog restored from `pendingPermission`
- **THEN** the frontend SHALL send a command to clear the pending permission
- **AND** the backend SHALL save the session with `pendingPermission` removed
- **AND** the PermissionDialog closes permanently for this session
