## MODIFIED Requirements

### Requirement: Session load saves current session first
The `handleSession` → `load` handler in `WebUiBackend` SHALL, before loading the requested session: (1) abort the current agent turn if one is running, (2) save the current session to disk via `harness.saveSessionNow()`, and (3) send an updated session list via `pushSessionList` so the sidebar reflects the saved session. Only after these steps SHALL it call `sessionManager.loadSession()` to replace agent state and send `clear_conversation` + `ready` to the client.

Additionally, if a tool permission prompt was active (`permissionResolve` is non-null), the save step SHALL: roll back the last partial assistant message from the agent's messages before persisting, and store `pendingPermission` information (`{ toolName, preview, fuzzyPattern, permissionArgs }`) in the session metadata.

#### Scenario: Load aborts running turn
- **WHEN** a session load is requested while the agent is processing (including while a tool permission prompt is active)
- **THEN** the WebUiBackend SHALL call `harness.abort()` to stop the current turn before proceeding with save and load

#### Scenario: Load saves current session with pending permission
- **WHEN** a session load is requested while a tool permission prompt is active for tool "bash"
- **THEN** the WebUiBackend SHALL save the current session with `pendingPermission: { toolName: "bash", preview: "...", fuzzyPattern: "mcp__*", permissionArgs: {...} }` in its metadata
- **AND** the last partial assistant message (role===assistant with a tool_use content block requesting "bash") SHALL be removed from the saved messages

#### Scenario: Load saves current session without pending permission
- **WHEN** a session load is requested and no tool permission prompt is active
- **THEN** the WebUiBackend SHALL save the current session normally without `pendingPermission` in metadata
- **AND** no messages are rolled back
