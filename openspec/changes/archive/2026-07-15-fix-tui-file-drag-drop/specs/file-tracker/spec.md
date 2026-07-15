## MODIFIED Requirements

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
