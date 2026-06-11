# session-management Specification (Delta)

## MODIFIED Requirements

### Requirement: SessionStore loadSessionFile Public Method

The `SessionStore` class SHALL expose a public method `loadSessionFile(sessionId: string): Promise<SerializedSession | null>` that reads a session JSON file from disk and returns the raw serialized data. Returns `null` on any error (missing file, invalid JSON, validation failure).

The eval module (specifically the CHIFF causal-graph analyzer) SHALL use this method to obtain raw session data for analysis. The returned `SerializedSession` SHALL include all message data with: `thinking` blocks, `toolCall` blocks (name, arguments), `toolResult` content blocks, `usage` statistics, `stopReason`, and `responseId` — as these fields are required for OTAR extraction and causal graph construction.

#### Scenario: Load existing session file for eval analysis

- **WHEN** `loadSessionFile("00MQ65456T8A429KH534XTYPZC")` is called and the session JSON file exists on disk
- **THEN** the method SHALL return the parsed `SerializedSession` object
- **AND** the object SHALL contain all raw message data including thinking, toolCall, toolResult, usage, and stopReason fields
- **AND** the eval analyzer SHALL be able to extract `HistoryStep[]` from this data

#### Scenario: Session file not found

- **WHEN** `loadSessionFile("nonexistent")` is called and no session file exists for that ID
- **THEN** the method SHALL return `null`
- **AND** NOT throw an error

#### Scenario: Corrupted session file

- **WHEN** `loadSessionFile(id)` is called and the session file contains invalid JSON
- **THEN** the method SHALL return `null`
- **AND** NOT crash the process

### Requirement: SessionManager getSessionFilePath Method

The `SessionManager` class SHALL expose a method `getSessionFilePath(idOrPrefix: string)` that locates a session file by full ID or prefix match (minimum 8 characters). It SHALL return `{ path: string; metadata: SessionMetadata }` on success, or `null` if no unique match. Uses `projectDirPath()` and `globalDirPath()` to scan both project and global session directories.

The eval module SHALL use this method to resolve session IDs before loading session data via `loadSessionFile()`.

#### Scenario: Match by full session ID

- **WHEN** `getSessionFilePath("00MQ65456T8A429KH534XTYPZC")` is called with a full valid ID
- **THEN** the method SHALL return the file path and metadata for that session

#### Scenario: Match by 8-character prefix

- **WHEN** `getSessionFilePath("00MQ6545")` is called with an 8-character prefix matching exactly one session
- **THEN** the method SHALL return the file path and metadata for the matching session

#### Scenario: Ambiguous prefix match

- **WHEN** `getSessionFilePath("00MQ65")` is called with a prefix shorter than 8 characters matching multiple sessions
- **THEN** the method SHALL return `null`

#### Scenario: No match

- **WHEN** `getSessionFilePath("ZZZZZZZZ")` is called and no session ID starts with that prefix
- **THEN** the method SHALL return `null`

### Requirement: SessionManager loadSessionFile Method

The `SessionManager` class SHALL expose a public method `loadSessionFile(sessionId: string): Promise<SerializedSession | null>` that delegates to `SessionStore.loadSessionFile()`. This provides a clean public API for loading raw session data without accessing internal store fields.

The eval module SHALL use this through `harness.sessionManager.loadSessionFile()` without any changes to the method signature or behavior.

#### Scenario: Load via SessionManager

- **WHEN** `manager.loadSessionFile(id)` is called
- **THEN** it SHALL delegate to `this.store.loadSessionFile(id)`
- **AND** return the result without modification
