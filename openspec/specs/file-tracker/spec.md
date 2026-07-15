## Purpose

Provide a per-message file path registry (FileTracker) that synchronizes bidirectionally with editor text markers and supports both TUI and Web UI drag-and-drop file attachment workflows.
## Requirements
### Requirement: FileTracker manages per-message attached file paths
The system SHALL provide a `FileTracker` class that maintains a registry of file paths attached to the current message, independent of the editor text content.

#### Scenario: Add a file within project directory
- **WHEN** `tracker.add("/Users/x/project/src/app.ts", "/Users/x/project")` is called
- **THEN** the tracker SHALL store the absolute path internally
- **AND** the tracker SHALL return the display path `"src/app.ts"` (relative to project)

#### Scenario: Add a file outside project directory
- **WHEN** `tracker.add("/Users/x/Downloads/report.pdf", "/Users/x/project")` is called
- **THEN** the tracker SHALL store the absolute path internally
- **AND** the tracker SHALL return the display path `"/Users/x/Downloads/report.pdf"` (absolute, unchanged)

#### Scenario: Deduplicate identical paths
- **WHEN** `tracker.add("/Users/x/project/src/app.ts", ...)` is called twice with the same absolute path
- **THEN** the tracker SHALL only store one entry
- **AND** the second call SHALL be a no-op

#### Scenario: Remove a tracked file
- **WHEN** `tracker.remove("/Users/x/project/src/app.ts")` is called with an absolute path
- **THEN** that entry SHALL be removed from the tracker

#### Scenario: Get all absolute paths for resolver
- **WHEN** `tracker.getAll()` is called
- **THEN** it SHALL return an array of all stored absolute paths in insertion order

#### Scenario: Get display paths for UI
- **WHEN** `tracker.getDisplayPaths()` is called
- **THEN** it SHALL return an array of display paths (relative or absolute) in insertion order

#### Scenario: Clear and drain
- **WHEN** `tracker.drain()` is called
- **THEN** it SHALL return all stored absolute paths
- **AND** the tracker SHALL be empty afterward

#### Scenario: Count tracked files
- **WHEN** `tracker.count` is accessed
- **THEN** it SHALL return the number of currently tracked file entries

### Requirement: Web UI handleDrop registers files in tracker instead of inserting @path text
When the user drops files onto the Web UI message input area, the system SHALL register the file paths in the FileTracker and display file chips, without inserting any text into the editor.

#### Scenario: Drop a file in project directory
- **WHEN** user drops `/Users/x/project/src/app.ts` onto the Web UI input area
- **THEN** the tracker SHALL register the file
- **AND** a chip SHALL appear showing the relative path `src/app.ts` with a remove button
- **AND** the editor text content SHALL NOT change

#### Scenario: Drop a file outside project directory
- **WHEN** user drops `/Users/x/Downloads/report.pdf` onto the Web UI input area
- **THEN** the tracker SHALL register the file
- **AND** a chip SHALL appear showing the full absolute path with a remove button
- **AND** the editor text content SHALL NOT change

#### Scenario: Remove file via chip
- **WHEN** user clicks the remove (×) button on a file chip
- **THEN** the file SHALL be removed from the tracker
- **AND** the chip SHALL disappear
- **AND** the editor text content SHALL NOT change

#### Scenario: Drop during processing
- **WHEN** the agent is currently processing a response
- **THEN** drag-and-drop SHALL be ignored (no-op)

### Requirement: TUI drag-and-drop file detection via bracketed paste
When the user drags a file from the OS file manager into the terminal, the TUI SHALL detect the file path from the bracketed paste data, register it in the FileTracker, and consume the paste event without letting the path text enter the editor.

#### Scenario: Detect file drop from bracketed paste
- **WHEN** a bracketed paste `\x1b[200~/Users/x/project/src/app.ts\n\x1b[201~` is received
- **AND** the pasted content is a single absolute path
- **AND** the file exists on disk
- **THEN** the TUI SHALL register the file in the tracker
- **AND** the TUI SHALL return `{ consume: true }` to prevent the text from reaching the editor

#### Scenario: Paste event that is not a file path
- **WHEN** a bracketed paste containing normal text (not a single absolute path to an existing file) is received
- **THEN** the TUI SHALL pass the text through to the editor unchanged (existing behavior)

#### Scenario: File outside project directory
- **WHEN** user drops `/Users/x/Downloads/report.pdf` into the terminal
- **THEN** the tracker SHALL store the absolute path
- **AND** the TUI status line SHALL show the count of tracked files

#### Scenario: Already-tracked file dropped again
- **WHEN** user drops a file path that is already registered in the tracker
- **THEN** the drop SHALL be silently ignored (no duplicate)

### Requirement: TUI status line shows tracked file count
The TUI SHALL display a status line indicating the number of currently tracked files and providing keyboard hints for removal.

#### Scenario: Status line after file drop
- **WHEN** one or more files are tracked
- **THEN** the status line SHALL show the count (e.g., "⬤ 2 files attached")
- **AND** SHALL show removal hints (e.g., "[⌫ remove last · Esc clear all]")

#### Scenario: Status line when no files tracked
- **WHEN** the tracker is empty
- **THEN** the status line SHALL be hidden or show empty state

#### Scenario: Backspace removes last tracked file
- **WHEN** user presses Backspace while the tracker has entries and the editor cursor is at an empty position
- **THEN** the last-added file SHALL be removed from the tracker
- **AND** the status line SHALL update to reflect the new count

#### Scenario: Escape clears all tracked files
- **WHEN** user presses Escape while the tracker has entries
- **THEN** all tracked files SHALL be cleared
- **AND** the status line SHALL update accordingly

### Requirement: submit with fileRefs passes fileRefs independently from text
When the user submits a message, the system SHALL pass tracked file paths as a separate `fileRefs` array. Image files SHALL be processed through `resolveFileRefs` and enter ImagePipeline. Non-image files SHALL be injected as absolute path references into the prompt text without reading file contents.

#### Scenario: Web UI submit with uploaded files (non-image)
- **WHEN** user drags non-image files into the Web UI and submits
- **THEN** the WebSocket command SHALL include `uploadedFiles` array with `{ name, content }` objects
- **AND** the `fileRefs` field SHALL NOT be used for web drag-and-drop
- **AND** the `text` field SHALL contain only the user's typed message text

#### Scenario: Web UI submit with dropped images
- **WHEN** user drags image files into the Web UI and submits
- **THEN** the images SHALL be read as base64 via FileReader in the browser
- **AND** the base64 data SHALL be sent in the `images` field (same as paste behavior)
- **AND** the image SHALL NOT go through `resolveFileRefs` on the server

#### Scenario: Web backend writes uploaded files to temp directory
- **WHEN** the Web backend receives `uploadedFiles` in a chat command
- **THEN** each file SHALL be written to `.dscode/uploads/<session-id>/<timestamp>-<filename>`
- **AND** the temp paths SHALL be injected into the prompt as `📁 Attached files:\n- \`/project/.dscode/uploads/...\``
- **AND** the Agent CAN read the files via `read_file` on the temp paths

#### Scenario: Web UI drop with mixed image and non-image files
- **WHEN** user drags both image and non-image files into the Web UI and submits
- **THEN** images SHALL go into `images` field as base64
- **AND** non-images SHALL go into `uploadedFiles` field with content
- **AND** both SHALL appear in the Agent prompt (images via ImagePipeline, non-images via temp path references)

#### Scenario: TUI submit with fileRefs containing images
- **WHEN** user presses Enter in the TUI with tracked image files
- **THEN** the submission SHALL include the image fileRefs from the tracker
- **AND** the image files SHALL be processed through `resolveFileRefs` and enter ImagePipeline
- **AND** the editor text content SHALL be preserved as user message text

#### Scenario: TUI submit with fileRefs containing non-image files
- **WHEN** user presses Enter in the TUI with tracked non-image files
- **THEN** the absolute paths SHALL be injected into the prompt as path references (e.g., `📁 Attached files:\n- \`/abs/path/file.ts\``)
- **AND** `resolveFileRefs` SHALL NOT be called for non-image files
- **AND** the file contents SHALL NOT be read

#### Scenario: TUI submit with mixed image and non-image fileRefs
- **WHEN** user presses Enter in the TUI with both image and non-image tracked files
- **THEN** image files SHALL go through `resolveFileRefs` → ImagePipeline
- **AND** non-image files SHALL be injected as path references only
- **AND** both image descriptions and path references SHALL appear in the Agent prompt

#### Scenario: Submit with no tracked files
- **WHEN** user submits a message with no tracked files
- **THEN** the `fileRefs` field SHALL be omitted or an empty array
- **AND** behavior SHALL be identical to before this change

#### Scenario: Tracker is drained after submit
- **WHEN** a message is submitted
- **THEN** the tracker SHALL be cleared (via `drain()`)
- **AND** the chips/status line SHALL be cleared

