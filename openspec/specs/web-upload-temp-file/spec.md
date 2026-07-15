# web-upload-temp-file Specification

## Purpose
TBD - created by archiving change fix-tui-file-drag-drop. Update Purpose after archive.
## Requirements
### Requirement: Web drag-and-drop uploads file content to server temp directory

When files are dragged-and-dropped into the Web UI, the browser SHALL read the file content via `FileReader` and transmit it to the server. The server SHALL write non-image files to a temporary directory and inject temp paths into the Agent prompt. Image files SHALL be sent as base64 in the `images` field, consistent with paste behavior.

#### Scenario: Drop a single non-image file in Web UI
- **WHEN** user drags `config.json` into the Web UI and submits with text "check this"
- **THEN** the browser SHALL read the file content via `FileReader.readAsText()`
- **AND** the WebSocket chat command SHALL include `uploadedFiles: [{ name: "config.json", content: "<file contents>" }]`
- **AND** the server SHALL write the content to `.dscode/uploads/<session-id>/<timestamp>-config.json`
- **AND** the Agent prompt SHALL contain `📁 Attached files:\n- \`<project>/.dscode/uploads/<session-id>/<timestamp>-config.json\``
- **AND** the Agent CAN read the temp file via `read_file`

#### Scenario: Drop multiple non-image files in Web UI
- **WHEN** user drags `a.ts`, `b.json`, `c.md` into the Web UI and submits
- **THEN** all three files SHALL be read and transmitted in `uploadedFiles`
- **AND** each SHALL be written to a separate temp file with unique timestamp prefix
- **AND** each temp path SHALL appear in the 📁 Attached files block

#### Scenario: Drop image files in Web UI
- **WHEN** user drags `photo.png` into the Web UI and submits
- **THEN** the browser SHALL read the image via `FileReader.readAsDataURL()`
- **AND** the image base64 SHALL be sent in the `images` field (NOT `fileRefs`)
- **AND** the image SHALL enter ImagePipeline on the server
- **AND** the server SHALL NOT call `resolveFileRefs` for browser-dropped images

#### Scenario: Drop mixed image and non-image files in Web UI
- **WHEN** user drags `photo.png`, `config.json`, `types.ts` into the Web UI and submits
- **THEN** `photo.png` SHALL be in `images` field as base64
- **AND** `config.json` and `types.ts` SHALL be in `uploadedFiles` field with content
- **AND** the image SHALL go through ImagePipeline
- **AND** the non-image files SHALL be written to temp paths and referenced in prompt

#### Scenario: Drop only non-image files with no user text in Web UI
- **WHEN** user drags `config.json` into the Web UI and submits without typing any text
- **THEN** the prompt SHALL contain the temp path reference
- **AND** the prompt SHALL NOT be empty or rejected

#### Scenario: Non-image file exceeds size limit for upload (no project match)
- **WHEN** user drags a file exceeding `maxFileSize` (from atFile config)
- **THEN** the browser SHALL check size before reading and skip the file
- **AND** a warning toast SHALL be shown to the user

#### Scenario: Total uploaded size exceeds limit in Web UI
- **WHEN** user drags files whose combined size exceeds `maxTotalSize` (from atFile config)
- **THEN** the browser SHALL skip files beyond the limit
- **AND** a warning toast SHALL be shown

#### Scenario: Temp file cleanup on session end
- **WHEN** a session ends or is compacted
- **THEN** the `.dscode/uploads/<session-id>/` directory SHALL be cleaned up
- **AND** temp files from other sessions SHALL NOT be affected

### Requirement: Web UI handleDrop mirrors handlePaste semantics

The drag-and-drop handler in the Web UI (`handleDrop`) SHALL use the same `FileReader`-based approach as `handlePaste`, reading file content in the browser rather than attempting to extract filesystem paths.

#### Scenario: handleDrop reads file content
- **WHEN** files are dropped into the MessageInput area
- **THEN** the handler SHALL iterate over `e.dataTransfer.files`
- **AND** for each image file, SHALL call `fileToImageAttachment()` to get base64
- **AND** for each non-image file, SHALL call `FileReader.readAsText()` to get content
- **AND** SHALL NOT attempt to read `(file as any).path`

#### Scenario: handleDrop does not use FileTracker for content
- **WHEN** files are dropped into the Web UI
- **THEN** the FileTracker SHALL NOT be used to track dropped files
- **AND** image base64 data SHALL be stored in the existing `images` state
- **AND** non-image content SHALL be stored in a new `uploadedFiles` state

### Requirement: ClientCommand protocol supports uploaded file content

The WebSocket `chat` command SHALL support a new `uploadedFiles` field for transmitting file content from browser to server.

#### Scenario: Chat command includes uploadedFiles
- **WHEN** the Web UI sends a chat command with uploaded non-image files
- **THEN** the command SHALL include `uploadedFiles: { name: string; content: string }[]`
- **AND** `content` SHALL be the UTF-8 text content of the file
- **AND** `name` SHALL be the original filename (for display and temp path generation)

#### Scenario: Chat command without uploaded files
- **WHEN** the Web UI sends a chat command with no uploaded files
- **THEN** the `uploadedFiles` field SHALL be omitted or an empty array
- **AND** behavior SHALL be identical to before this change

### Requirement: Dragged project files resolve as @path references

When a non-image file is dragged into the Web UI and its filename matches a file in the project directory tree, the system SHALL inject it as a `@path` reference rather than reading the file content. This achieves zero-size-limit "link" semantics for project files, matching TUI behavior.

#### Scenario: Single project file — unique name match
- **WHEN** user drags `config.json` into the Web UI and the project has exactly one file named `config.json` at `src/lib/config.json`
- **THEN** the browser SHALL search the project file tree for matching files (via the existing `file_list` command)
- **AND** the file SHALL be injected as `@src/lib/config.json` in the input text
- **AND** the file content SHALL NOT be read or transmitted
- **AND** the Agent SHALL receive the @path reference and can `read_file` the original file directly

#### Scenario: Multiple project files with same name — picker fallback
- **WHEN** user drags `config.json` and the project has `src/config.json` and `tests/config.json`
- **THEN** a file picker popover SHALL appear (reusing the existing `showFileMenu` UI component)
- **AND** the user SHALL select one file from the list
- **AND** the selected file SHALL be injected as `@<selected-path>`
- **AND** no file content SHALL be read or transmitted

#### Scenario: External file — no project match
- **WHEN** user drags `desktop-file.pdf` and no project file has that name
- **THEN** the system SHALL fall back to the existing upload-to-temp-directory flow
- **AND** the file content SHALL be read and transmitted to the server

#### Scenario: Project file with ambiguous name — user cancels picker
- **WHEN** user drags a file with multiple project matches and dismisses the picker (Escape or click outside)
- **THEN** the file SHALL be dropped silently (no upload, no error)

### Requirement: File size limits are config-driven

The drag-and-drop size limits SHALL be driven by server config rather than hardcoded constants. The browser SHALL receive `maxFileSize` and `maxTotalSize` values from the server (via the `config` or `ready` event) and apply them before reading file content.

#### Scenario: Size limits received from server
- **WHEN** the Web UI connects and receives `config` event
- **THEN** the config SHALL include `maxFileSize` and `maxTotalSize` values
- **AND** the browser SHALL use these values for size checks, NOT hardcoded constants

#### Scenario: Non-image file exceeds maxFileSize
- **WHEN** user drags a non-image file exceeding `maxFileSize` (and the file has no project match)
- **THEN** the browser SHALL skip the file before reading its content
- **AND** a warning toast SHALL be shown: "Skipped filename.ext (exceeds X MB limit)"

#### Scenario: Combined upload exceeds maxTotalSize
- **WHEN** user drags multiple files whose combined size exceeds `maxTotalSize`
- **THEN** the browser SHALL skip files beyond the limit
- **AND** a warning toast SHALL indicate how many files were skipped

#### Scenario: Image files are NOT subject to size limits
- **WHEN** user drags an image file of any size
- **THEN** the image SHALL be processed through `fileToImageAttachment` → `compressImage` regardless of size
- **AND** `maxFileSize` / `maxTotalSize` SHALL NOT apply to images

### Requirement: Settings panel shows upload cache info and clear button

The Settings panel in the Web UI sidebar SHALL display information about the upload cache (`.dscode/uploads/`) and provide a button to clear it.

#### Scenario: Display upload cache stats
- **WHEN** the Settings panel renders
- **THEN** it SHALL show the current upload cache stats: number of files and total size (e.g., "Uploaded files: 5 files / 2.3 MB")
- **AND** the stats SHALL be updated when the server sends `upload_stats` events

#### Scenario: Clear upload cache
- **WHEN** user clicks "Clear Upload Cache" button
- **THEN** the browser SHALL send `{ type: "clear_uploads" }` to the server
- **AND** the server SHALL delete all files in `.dscode/uploads/` recursively
- **AND** the server SHALL respond with `{ type: "upload_stats", files: 0, bytes: 0 }`
- **AND** a success toast SHALL be shown: "Cleared N files (X MB)"
- **AND** the displayed stats SHALL update to 0 files / 0 B

#### Scenario: Clear empty cache
- **WHEN** user clicks "Clear Upload Cache" when `.dscode/uploads/` is empty or doesn't exist
- **THEN** the server SHALL respond with `{ type: "upload_stats", files: 0, bytes: 0 }`
- **AND** an info toast SHALL be shown: "No cached files to clear"

#### Scenario: Upload stats sent on startup
- **WHEN** the server starts or a client connects
- **THEN** the server SHALL scan `.dscode/uploads/` and send the current stats via `{ type: "upload_stats", files: N, bytes: M }`

