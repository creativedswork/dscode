## MODIFIED Requirements

### Requirement: Session load saves current session first
The `handleSession` → `load` handler in `WebUiBackend` SHALL, before loading the requested session: (1) abort the current agent turn if one is running, (2) save the current session to disk via `harness.saveSessionNow()`, and (3) send an updated session list via `pushSessionList` so the sidebar reflects the saved session. Only after these steps SHALL it call `sessionManager.loadSession()` to replace agent state and send `clear_conversation` + `ready` to the client.

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
- **WHEN** abort and save have both completed
- **THEN** the server calls `sessionManager.loadSession(id, agent)`, then sends `clear_conversation` and `ready` with the loaded session's conversation history

## ADDED Requirements

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
- **THEN** that session is still excluded from `listSessions()` output; the `pushSessionList` server method adds it back when sending to the client, using `currentSessionId` to identify it
