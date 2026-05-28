## ADDED Requirements

### Requirement: Session load validates file integrity
The system SHALL validate loaded session files and SHALL NOT silently return null for corrupted data. Validation failures MUST produce distinct, descriptive error messages.

#### Scenario: Valid session file loads successfully
- **WHEN** a session file contains valid JSON with `version`, `metadata`, and `messages` fields
- **AND** `metadata` contains `id`, `title`, `createdAt`, `updatedAt`
- **AND** `metadata.id` matches the filename
- **THEN** the session loads successfully with no errors

#### Scenario: Corrupted JSON file produces clear error
- **WHEN** a session file contains malformed JSON
- **THEN** the system reports "Session file is corrupted: invalid JSON" to the UI
- **AND** the session does not load

#### Scenario: Missing metadata fields produce clear error
- **WHEN** a session file has valid JSON but `metadata` is missing `title`
- **THEN** the system reports "Session file is corrupted: missing required field 'metadata.title'"
- **AND** the session does not load

#### Scenario: ID mismatch between filename and metadata produces clear error
- **WHEN** a session file named `abc123.json` has `metadata.id` set to `xyz789`
- **THEN** the system reports "Session file is corrupted: ID mismatch (expected abc123, got xyz789)"
- **AND** the session does not load

#### Scenario: Empty session file produces clear error
- **WHEN** a session file is empty (0 bytes)
- **THEN** the system reports "Session file is empty"
- **AND** the session does not load

### Requirement: Session save uses atomic write with integrity guarantee
The system SHALL write session data to a temporary file first, then atomically rename it to the final path. The direct-write fallback SHALL be removed.

#### Scenario: Atomic write succeeds
- **WHEN** a session is saved
- **THEN** data is written to `<id>.json.tmp`, then renamed to `<id>.json`
- **AND** no partial `<id>.json` file is ever observable by readers

#### Scenario: Write failure is reported
- **WHEN** the atomic write fails (e.g., disk full)
- **THEN** the system reports "Failed to save session: <reason>" to the UI
- **AND** no corrupted session file is left behind

### Requirement: Session delete cleans up both file and index
The system SHALL remove the session JSON file and its index entry atomically. If removal of either fails, the error SHALL be reported.

#### Scenario: Successful delete removes both file and index entry
- **WHEN** a session is deleted
- **THEN** the `<id>.json` file is removed
- **AND** the session is removed from the project's `index.json`

#### Scenario: Delete of non-existent session reports error
- **WHEN** a session ID that does not exist is deleted
- **THEN** the system reports "Session not found: <id>"

### Requirement: Session list handles missing or corrupted index gracefully
The system SHALL rebuild the index from available session files if `index.json` is missing or corrupted.

#### Scenario: Missing index triggers rebuild
- **WHEN** `index.json` does not exist in a project directory
- **AND** session JSON files exist
- **THEN** the system scans JSON files and rebuilds the index

#### Scenario: Corrupted index triggers rebuild
- **WHEN** `index.json` contains invalid JSON
- **THEN** the system scans JSON files and rebuilds the index
