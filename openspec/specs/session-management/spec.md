## Purpose

Session persistence layer: store, load, list, and delete conversation sessions with versioned JSON files. Supports image caching via ImageRef and vision message tracking.
## Requirements
### Requirement: Session Version Upgrade to V2

The `SerializedSession` SHALL support version 2 with image references.

#### Scenario: V2 session save
- **WHEN** a session contains messages with images
- **THEN** the saved session file SHALL have `version: 2`
- **AND** messages SHALL use `ImageRef` instead of inline base64 for image content
- **AND` metadata SHALL include `hasImages: boolean` and `imageCount: number`

#### Scenario: V2 session load
- **WHEN** a session file with `version: 2` is loaded
- **THEN** the system SHALL parse its messages including `ImageRef` and `visionMessages`
- **AND** attempt to recover image data from cache

### Requirement: V1 Backward Compatibility

The session store SHALL load version 1 session files without error.

#### Scenario: Load V1 session
- **WHEN** a session file has `version: 1`
- **THEN** the system SHALL load it successfully
- **AND** set `hasImages: false` on the metadata
- **AND** not attempt to parse `visionMessages` or `ImageRef` fields

### Requirement: SessionStore loadSessionFile Public Method

The `SessionStore` class SHALL expose a public method `loadSessionFile(sessionId: string): Promise<SerializedSession | null>` that reads a session JSON file from disk and returns the raw serialized data. Returns `null` on any error (missing file, invalid JSON, validation failure). The returned data SHALL include all message fields required for CHIFF causal graph analysis: thinking blocks, toolCall blocks (name, arguments), toolResult content blocks, usage statistics, stopReason, and responseId.

#### Scenario: Load existing session file

- **WHEN** `loadSessionFile("00MPX37L8RW7I64DNM725JX5MK")` is called and the session JSON file exists on disk
- **THEN** the method SHALL return the parsed `SerializedSession` object
- **AND** the object SHALL contain all raw message data including thinking, toolCall, toolResult, usage, and stopReason fields

#### Scenario: Session file not found

- **WHEN** `loadSessionFile("nonexistent")` is called and no session file exists for that ID
- **THEN** the method SHALL return `null`
- **AND** NOT throw an error

#### Scenario: Corrupted session file

- **WHEN** `loadSessionFile(id)` is called and the session file contains invalid JSON
- **THEN** the method SHALL return `null`
- **AND** NOT crash the process

### Requirement: SessionStore projectDirPath Public Method

The `SessionStore` class SHALL expose a public method `projectDirPath(): string` that returns the project-specific session directory path, complementing the existing `globalDirPath()` method.

#### Scenario: projectDirPath returns correct directory

- **WHEN** `projectDirPath()` is called
- **THEN** it SHALL return the project-scoped session directory (e.g., `~/.dscode/data/sessions/by-project/<slug>`)

### Requirement: SessionManager getSessionFilePath Method

The `SessionManager` class SHALL expose a method `getSessionFilePath(idOrPrefix: string)` that locates a session file by full ID or prefix match (minimum 8 characters). It SHALL return `{ path: string; metadata: SessionMetadata }` on success, or `null` if no unique match. Uses `projectDirPath()` and `globalDirPath()` to scan both project and global session directories.

#### Scenario: Match by full session ID

- **WHEN** `getSessionFilePath("00MPX37L8RW7I64DNM725JX5MK")` is called with a full valid ID
- **THEN** the method SHALL return the file path and metadata for that session

#### Scenario: Match by 8-character prefix

- **WHEN** `getSessionFilePath("00MPX37L8")` is called with an 8-character prefix matching exactly one session
- **THEN** the method SHALL return the file path and metadata for the matching session

#### Scenario: Ambiguous prefix match

- **WHEN** `getSessionFilePath("00MPX37L")` is called with a prefix shorter than 8 characters matching multiple sessions
- **THEN** the method SHALL return `null`

#### Scenario: No match

- **WHEN** `getSessionFilePath("ZZZZZZZZ")` is called and no session ID starts with that prefix
- **THEN** the method SHALL return `null`

### Requirement: SessionManager loadSessionFile Method

The `SessionManager` class SHALL expose a public method `loadSessionFile(sessionId: string): Promise<SerializedSession | null>` that delegates to `SessionStore.loadSessionFile()`. This provides a clean public API for loading raw session data without accessing internal store fields.

#### Scenario: Load via SessionManager

- **WHEN** `manager.loadSessionFile(id)` is called
- **THEN** it SHALL delegate to `this.store.loadSessionFile(id)`
- **AND** return the result without modification

### Requirement: Session load saves current session first
The `handleSession` → `load` handler in `WebUiBackend` SHALL, before loading the requested session: (1) abort the current agent turn if one is running, (2) save the current session to disk via `harness.saveSessionNow()`, and (3) send an updated session list via `pushSessionList` so the sidebar reflects the saved session. Only after these steps SHALL it call `sessionManager.loadSession()` to replace agent state and send `clear_conversation` + `ready` to the client.

Additionally, if a tool permission prompt was active (`permissionResolve` is non-null), the save step SHALL: roll back the last partial assistant message from the agent's messages before persisting, and store `pendingPermission` information (`{ toolName, preview, fuzzyPattern, permissionArgs }`) in the session metadata.

#### Scenario: Load aborts running turn
- **WHEN** the client sends `{ type: "session", action: "load", id: "B" }` and the agent is currently processing a turn
- **THEN** the server calls `harness.abort()` to stop the running turn before loading session B

#### Scenario: Load saves current session
- **WHEN** the client sends a session load command
- **THEN** the server calls `harness.saveSessionNow()` to persist the current session to disk before overwriting agent state

#### Scenario: Load sends updated session list
- **WHEN** the server has saved the current session after a load command
- **THEN** it calls `pushSessionList(client)` so the frontend sidebar displays all sessions including the just-saved one

#### Scenario: Load proceeds after abort and save

#### Scenario: Load saves current session with pending permission
- **WHEN** a session load is requested while a tool permission prompt is active for tool "bash"
- **THEN** the WebUiBackend SHALL save the current session with `pendingPermission: { toolName: "bash", preview: "...", fuzzyPattern: "mcp__*", permissionArgs: {...} }` in its metadata
- **AND** the last partial assistant message (role===assistant with a tool_use content block requesting "bash") SHALL be removed from the saved messages

#### Scenario: Load saves current session without pending permission
- **WHEN** a session load is requested and no tool permission prompt is active
- **THEN** the WebUiBackend SHALL save the current session normally without `pendingPermission` in metadata
- **AND** no messages are rolled back
- **WHEN** abort and save have both completed
- **THEN** the server calls `sessionManager.loadSession(id, agent)`, then sends `clear_conversation` and `ready` with the loaded session's conversation history

### Requirement: Zero-message session reuse on create
When `SessionManager.createSession()` is called, it SHALL scan existing sessions in the current project scope. If any session has `messageCount === 0`, it SHALL reuse that session's `id` and `createdAt` fields (updating only `updatedAt`, `modelProvider`, and `modelId`) instead of generating a new ULID.

#### Scenario: Reuse existing empty session
- **WHEN** `createSession()` is called and a session with `messageCount === 0` exists in the current project
- **THEN** the returned `SessionMetadata` reuses the existing session's `id` and `createdAt`, with `updatedAt` set to now, `modelProvider` and `modelId` from arguments

#### Scenario: Create new session when none are empty
- **WHEN** `createSession()` is called and no session with `messageCount === 0` exists in the current project
- **THEN** a new ULID is generated and returned as a fresh `SessionMetadata`

### Requirement: persistEmptySession deduplicates
When `SessionManager.persistEmptySession()` is called, it SHALL, before writing the current empty session, delete any other session file in the same project directory whose metadata has `messageCount === 0` (excluding the current session itself).

#### Scenario: Clean up prior empty sessions
- **WHEN** `persistEmptySession()` is called and another session file with `messageCount === 0` exists on disk in the current project directory
- **THEN** that other session file is deleted before the current empty session is written

#### Scenario: No duplicate delete of self
- **WHEN** `persistEmptySession()` is called and the only session with `messageCount === 0` is the current session
- **THEN** the current session file is written without deleting itself

### Requirement: listSessions filters zero-message entries
`SessionManager.listSessions()` SHALL exclude sessions where `messageCount === 0` from the returned array.

#### Scenario: Empty sessions excluded from list
- **WHEN** `listSessions()` is called and the current project contains sessions with `messageCount` values of 0, 3, and 5
- **THEN** the returned array contains only the sessions with `messageCount` 3 and 5

#### Scenario: Current session preserved in list when empty
- **WHEN** the current active session has `messageCount === 0`
- **THEN** that session is still excluded from `listSessions()` output; the `pushSessionList` server method adds it back when sending to the client, using `currentSessionId` to identify it; the `handleSession` `"load"` handler also falls back to `getCurrentMetadata()` when `listSessions()` returns no matches


### Requirement: handleSession load fallback to current session

The `WebUiBackend.handleSession` `"load"` handler SHALL, when `listSessions()` returns zero matches for the requested session ID, check whether the request ID matches the current active session via `sessionManager.getCurrentMetadata()`. If the current session metadata exists and its `id` starts with the requested ID prefix, the handler SHALL proceed with loading the current session instead of returning a "Session not found" error.

This ensures consistency with `pushSessionList()`, which already includes the current session in the client-facing list even when its `messageCount` is 0.

#### Scenario: Load current empty session via sidebar click

- **WHEN** the client sends `{ type: "session", action: "load", id: "<currentSessionId>" }` and the current session has `messageCount === 0` (thus excluded from `listSessions()` output)
- **THEN** the handler finds no match in `listSessions()` but detects that `getCurrentMetadata()?.id` starts with the requested ID
- **AND** proceeds with the normal load flow (abort → save → loadSession → clear_conversation → ready)
- **AND** does NOT return "Session not found" error

#### Scenario: Load non-existent session still returns error

- **WHEN** the client sends `{ type: "session", action: "load", id: "NONEXIST" }` and no session with that ID exists (neither in `listSessions()` nor as current session)
- **THEN** the handler returns `{ type: "error", text: "Session not found: NONEXIST" }`

#### Scenario: Ambiguous prefix match still returns error

- **WHEN** the client sends `{ type: "session", action: "load", id: "00" }` and `listSessions()` matches more than one session with that prefix
- **THEN** the handler returns `{ type: "error", text: "Ambiguous session ID prefix. ..." }` without checking the current session fallback

### Requirement: rebuildIndex preserves empty-message sessions

`SessionStore.rebuildIndex()` SHALL include session files with `messages.length === 0` in the rebuilt index, as long as the file contains valid `metadata` with a valid `id` field. Only files that fail to parse as valid JSON or lack valid `metadata.id` SHALL be skipped.

The existing fix-up for `messageCount === 0 && messages.length > 0` SHALL remain unchanged.

#### Scenario: Empty session preserved in rebuilt index

- **WHEN** `rebuildIndex()` scans a directory containing a valid session file with `messages: []` and valid metadata
- **THEN** that session SHALL appear in the rebuilt index with its original metadata

#### Scenario: Corrupted session file still skipped

- **WHEN** `rebuildIndex()` scans a directory containing a file with invalid JSON or missing `metadata.id`
- **THEN** that file SHALL be silently skipped
