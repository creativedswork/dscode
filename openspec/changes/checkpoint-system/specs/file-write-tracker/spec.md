## ADDED Requirements

### Requirement: FileWriteTracker records writer type on write

The FileWriteTracker SHALL provide a `recordWrite(filePath, writerType)` method that records the given writer type (`"edit"`, `"write_file"`, `"overwrite_file"`) as the most recent writer for the specified file path.

#### Scenario: Record write for a file

- **WHEN** `fileWriteTracker.recordWrite("/path/to/file.ts", "edit")` is called
- **THEN** subsequent `fileWriteTracker.getWriter("/path/to/file.ts")` SHALL return `"edit"`

#### Scenario: Overwrite previous writer record

- **WHEN** `fileWriteTracker.recordWrite("/path/to/file.ts", "write_file")` is called
- **AND** `fileWriteTracker.recordWrite("/path/to/file.ts", "edit")` is subsequently called
- **THEN** `fileWriteTracker.getWriter("/path/to/file.ts")` SHALL return `"edit"`

### Requirement: FileWriteTracker determines baseline continuity

The FileWriteTracker SHALL provide a `getContinuity(filePath, currentWriterType)` method that returns `"clean"` if the file has no prior writer or the same writer, `"mixed"` if the file was previously written by a different writer type.

#### Scenario: First write is clean

- **WHEN** `fileWriteTracker.getContinuity("/path/to/new.ts", "edit")` is called on a file with no prior writer
- **THEN** the return value SHALL be `"clean"`

#### Scenario: Same writer is clean

- **WHEN** `fileWriteTracker.recordWrite("/path/to/file.ts", "edit")` is called
- **AND** `fileWriteTracker.getContinuity("/path/to/file.ts", "edit")` is called
- **THEN** the return value SHALL be `"clean"`

#### Scenario: Different writer is mixed

- **WHEN** `fileWriteTracker.recordWrite("/path/to/file.ts", "bash")` is called
- **AND** `fileWriteTracker.getContinuity("/path/to/file.ts", "edit")` is called
- **THEN** the return value SHALL be `"mixed"`

### Requirement: FileWriteTracker marks files as externally modified

The FileWriteTracker SHALL provide a `markExternalWrite(filePath)` method that records a file as having been potentially modified by an external writer (e.g., `bash`). This SHALL set the writer to `"bash"`.

#### Scenario: External write marks file

- **WHEN** `fileWriteTracker.markExternalWrite("/path/to/file.ts")` is called
- **THEN** `fileWriteTracker.getWriter("/path/to/file.ts")` SHALL return `"bash"`
- **AND** subsequent `getContinuity("/path/to/file.ts", "edit")` SHALL return `"mixed"`

### Requirement: FileWriteTracker invalidates anchors on external write

When `markExternalWrite(filePath)` is called on a file, the FileWriteTracker SHALL return a signal indicating that all cached anchors for that file should be considered invalid.

#### Scenario: External write signals anchor invalidation

- **WHEN** `fileWriteTracker.markExternalWrite("/path/to/file.ts")` is called
- **THEN** the return value SHALL indicate that anchors for this file are now stale
- **AND** subsequent `edit` operations on this file without re-reading SHALL receive `baseline_continuity: "mixed"` in validation
