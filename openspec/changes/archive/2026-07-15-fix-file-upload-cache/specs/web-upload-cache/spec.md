## ADDED Requirements

### Requirement: Settings panel displays upload cache size
The Settings panel SHALL display the total size of uploaded files stored in `.dscode/uploads/`, along with file count and session count. The cache size SHALL be queried from the server each time the Settings tab becomes active.

#### Scenario: Cache block shows size, file count, and session count
- **WHEN** the user opens the Settings panel
- **THEN** the Upload Cache block SHALL query the server for cache statistics
- **AND** display total size in human-readable format (e.g., "47 MB")
- **AND** display file count and session count (e.g., "23 files · 5 sessions")

#### Scenario: Cache block shows zero state
- **WHEN** the server reports 0 bytes of cache
- **THEN** the cache size SHALL display "0 B"
- **AND** the subtext SHALL display "no cached files"
- **AND** the Clear button SHALL be disabled

#### Scenario: Cache block shows loading state
- **WHEN** the Settings tab becomes active and the cache size query is in flight
- **THEN** the cache block SHALL display "..." as the size
- **AND** the subtext SHALL indicate a loading state (e.g., "calculating...")
- **AND** the Clear button SHALL be disabled during loading

#### Scenario: Cache block shows warning for large cache
- **WHEN** the server reports cache total exceeding 40 MB
- **THEN** the cache block SHALL receive a visual warning treatment (danger border color using `--color-error-text`)
- **AND** the helper text SHALL change to "Consider clearing to free disk space"

#### Scenario: Cache block uses design tokens
- **WHEN** the cache block renders
- **THEN** it SHALL use semantic `--color-*` CSS custom properties for all colors
- **AND** the cache size SHALL use mono font (Geist Mono)
- **AND** labels SHALL use the muted text color token

### Requirement: User can clear upload cache
The Settings panel SHALL provide a Clear button that sends a command to the server to delete all uploaded files in `.dscode/uploads/`. The UI SHALL reflect the clearing state and update upon completion.

#### Scenario: Clicking Clear deletes all uploads
- **WHEN** the user clicks the Clear button
- **THEN** a `{ type: "cache", action: "clear" }` command SHALL be sent to the server
- **AND** the cache block SHALL enter a clearing state showing "..." with the Clear button disabled
- **AND** upon receiving the updated `cache_size` event, the block SHALL update to show zero

#### Scenario: Clear button disabled when cache is empty
- **WHEN** the cache size is 0
- **THEN** the Clear button SHALL be disabled

#### Scenario: Clear button enabled when cache is non-empty
- **WHEN** the cache size is greater than 0
- **THEN** the Clear button SHALL be enabled

### Requirement: Server provides cache statistics endpoint
The WebSocket server SHALL support a `{ type: "cache", action: "size" }` client command and respond with a `{ type: "cache_size", totalBytes, fileCount, sessionCount }` server event. The server SHALL recursively scan the `<project>/.dscode/uploads/` directory.

#### Scenario: Server responds with cache statistics
- **WHEN** the server receives `{ type: "cache", action: "size" }`
- **THEN** it SHALL scan `.dscode/uploads/` for all files across all session subdirectories
- **AND** respond with `{ type: "cache_size", totalBytes: number, fileCount: number, sessionCount: number }`

#### Scenario: Server handles missing upload directory
- **WHEN** the `.dscode/uploads/` directory does not exist
- **THEN** the server SHALL respond with `{ type: "cache_size", totalBytes: 0, fileCount: 0, sessionCount: 0 }`

### Requirement: Server clears upload cache on command
The WebSocket server SHALL support a `{ type: "cache", action: "clear" }` client command. It SHALL remove all files and directories under `.dscode/uploads/` and respond with an updated `cache_size` event showing zero.

#### Scenario: Clear removes all upload directories
- **WHEN** the server receives `{ type: "cache", action: "clear" }`
- **THEN** it SHALL recursively delete all contents of `.dscode/uploads/`
- **AND** respond with `{ type: "cache_size", totalBytes: 0, fileCount: 0, sessionCount: 0 }`

#### Scenario: Clear when directory is already empty
- **WHEN** the upload directory does not exist or is empty
- **THEN** the clear operation SHALL complete without error
- **AND** respond with `{ type: "cache_size", totalBytes: 0, fileCount: 0, sessionCount: 0 }`

### Requirement: Session deletion cleans up upload cache
When a session is deleted, the server SHALL also delete the corresponding upload directory at `.dscode/uploads/<sessionId>/`.

#### Scenario: Deleting session removes its upload files
- **WHEN** a session is deleted
- **THEN** the server SHALL call `cleanupUploadDir(sessionId)` to remove `.dscode/uploads/<sessionId>/`

#### Scenario: Deleting session without uploads is safe
- **WHEN** a session is deleted but `.dscode/uploads/<sessionId>/` does not exist
- **THEN** the cleanup SHALL not throw or produce an error
