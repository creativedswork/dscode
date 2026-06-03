## ADDED Requirements

### Requirement: SessionStore loadSessionFile Public Method

The `SessionStore` class SHALL expose a public method `loadSessionFile(sessionId: string): Promise<SerializedSession | null>` that reads a session JSON file from disk and returns the raw serialized data. Returns `null` on any error (missing file, invalid JSON, validation failure).

#### Scenario: Load existing session file

- **WHEN** `loadSessionFile("00MPX37L8RW7I64DNM725JX5MK")` is called and the session JSON file exists on disk
- **THEN** the method SHALL return the parsed `SerializedSession` object
- **AND** the object SHALL contain all raw message data including toolResult content blocks

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
