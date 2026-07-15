## MODIFIED Requirements

### Requirement: Web UI prompt accepts drag-and-drop files
The Web UI `MessageInput` component SHALL accept files and directories dragged from the OS file manager onto the textarea or its surrounding input area. Non-image files SHALL be read as text and uploaded to the server if they are within size limits. Dropped files that exceed size limits SHALL produce a toast notification.

#### Scenario: Single file drop (project file — relative path)
- **WHEN** the user drags a file (`app.ts`) from within the project directory onto the Web UI input area
- **THEN** a `FileAttachment` with `name: "app.ts"`, `size`, `mimeType`, and `path` (absolute) SHALL be created
- **AND** the display path SHALL be inserted into the textarea as a relative `@path` (e.g., `@src/app.ts`)
- **AND** a file chip displaying the filename, size, and icon SHALL appear above the textarea

#### Scenario: Single file drop (external file — absolute path)
- **WHEN** the user drags a file from outside the project directory (e.g., `~/Downloads/report.pdf`)
- **THEN** a `FileAttachment` with the absolute path SHALL be created
- **AND** the display path SHALL be inserted as the absolute `@path` (e.g., `@/Users/x/Downloads/report.pdf`)
- **AND** a file chip SHALL appear above the textarea

#### Scenario: Multiple file drop
- **WHEN** the user drags multiple files in a single drop operation
- **THEN** each file SHALL produce its own `FileAttachment`, `@path` insertion, and chip
- **AND** paths SHALL be separated by spaces in the textarea

#### Scenario: Directory drop
- **WHEN** the user drags a directory onto the input area
- **THEN** the directory path SHALL be inserted as `@<directory-path>/` (with trailing slash)
- **AND** a file chip with a folder icon SHALL appear

#### Scenario: Dragover visual feedback
- **WHEN** the user drags a file over the input area
- **THEN** the input area border or background SHALL change to indicate it is a valid drop target (e.g., border color shift or subtle background highlight)

#### Scenario: Dragover leaves
- **WHEN** the user drags a file away from the input area without dropping
- **THEN** the visual feedback SHALL revert to the default state

#### Scenario: Drop during processing
- **WHEN** the agent is processing a request (`processing` is true)
- **THEN** the drop zone SHALL NOT accept files (no `@path` insertion, no chip)
- **AND** the textarea's native disabled state prevents interaction

#### Scenario: Non-image file within size limit
- **WHEN** the user drops a non-image file (e.g., PDF, TXT) that is at most 10 MB and does not cause the total batch to exceed 50 MB
- **THEN** the file content SHALL be read as text and uploaded to the server as an `uploadedFile`
- **AND** the uploaded content SHALL be written to `.dscode/uploads/<sessionId>/<timestamp>-<filename>`

#### Scenario: File exceeds single-file size limit
- **WHEN** the user drops a non-image file larger than 10 MB
- **THEN** the file SHALL be skipped
- **AND** a toast notification SHALL display "File '<filename>' exceeds 10 MB limit"

#### Scenario: File batch exceeds total size limit
- **WHEN** the user drops multiple files whose cumulative non-image size exceeds 50 MB
- **THEN** files beyond the 50 MB threshold SHALL be skipped
- **AND** a toast notification SHALL display "Total file size exceeds 50 MB limit"

#### Scenario: Image files are not subject to the 10 MB limit
- **WHEN** the user drops an image file
- **THEN** it SHALL be processed through the existing image compression pipeline
- **AND** the 10 MB single-file limit SHALL NOT apply to image files

### Requirement: FileAttachment type
The shared UI data model SHALL include a `FileAttachment` type representing a dropped file's metadata without its contents.

#### Scenario: FileAttachment structure
- **WHEN** a file is dropped
- **THEN** the resulting `FileAttachment` SHALL contain `name: string`, `size: number`, `mimeType: string`, and `path: string` (absolute filesystem path)

#### Scenario: FileAttachment distinct from ImageAttachment
- **WHEN** a file is dropped (as opposed to pasted as an image)
- **THEN** the `FileAttachment` SHALL NOT contain a `data` field
- **AND** `ImageAttachment` SHALL remain unchanged (still contains `data` and `mimeType`)

### Requirement: File chips in the input area
Dropped files SHALL be displayed as chips above the textarea in the `MessageInput` component. Each chip SHALL show an icon based on the file's MIME type, the filename, the file size, and a remove button.

#### Scenario: Chip icon by MIME type
- **WHEN** a file with MIME type `text/typescript` is dropped
- **THEN** the chip SHALL display a text-file icon (Phosphor `TextAlignLeft`)
- **AND** a file with MIME type `image/png` SHALL display an image icon (Phosphor `Image`)
- **AND** a file with unknown MIME type SHALL display a generic file icon (Phosphor `File`)

#### Scenario: Chip shows filename and size
- **WHEN** a file is dropped
- **THEN** the chip SHALL display the file's `name` in a readable font
- **AND** the file size SHALL be shown in human-readable format (KB, MB)

#### Scenario: Remove individual chip
- **WHEN** the user clicks the remove button (×) on a file chip
- **THEN** the chip SHALL be removed from the input area
- **AND** the corresponding `@path` SHALL be removed from the textarea text
- **AND** the `FileAttachment` SHALL be removed from state

#### Scenario: Chip layout
- **WHEN** multiple files are dropped
- **THEN** chips SHALL wrap to multiple rows if they exceed the input area width
- **AND** chips SHALL use the same visual language as existing image thumbnail chips (border: 1px solid var(--color-border), border-radius: 8px)

#### Scenario: Chip not rendered when no files
- **WHEN** no files have been dropped (state is empty)
- **THEN** no file chip container SHALL be rendered in the DOM

### Requirement: Dropped paths use relative form for project files
File paths inserted from drag-and-drop SHALL use relative paths when the file is inside the project directory, and absolute paths only for files outside the project. The `FileAttachment.path` field always stores the absolute path for resolution.

#### Scenario: Project file gets relative display path
- **WHEN** a file within the project directory is dropped (e.g., absolute path `/Users/x/project/src/App.tsx` and project root is `/Users/x/project`)
- **THEN** the `@path` inserted into the textarea SHALL use the relative form (e.g., `@src/App.tsx`)
- **AND** the `FileAttachment.path` SHALL still store the absolute path

#### Scenario: External file gets absolute display path
- **WHEN** a file outside the project directory is dropped (e.g., from `~/Downloads/`)
- **THEN** the `@path` inserted into the textarea SHALL use its absolute path (e.g., `@/Users/x/Downloads/report.pdf`)
- **AND** the `FileAttachment.path` SHALL store the same absolute path
- **AND** the path SHALL be resolvable by the backend at-file resolver

### Requirement: Bidirectional chip–text sync
File chips and `@path` references in the textarea SHALL remain synchronized in both directions. Removing a chip removes the `@path`; removing the `@path` from text removes the chip.

#### Scenario: Manually deleting @path removes chip
- **WHEN** a file has been dropped and a chip is visible
- **AND** the user manually deletes the corresponding `@path` substring from the textarea
- **THEN** the file chip SHALL be automatically removed from the input area
- **AND** the `FileAttachment` SHALL be removed from state

#### Scenario: Deleting @path for one file does not affect others
- **WHEN** multiple files have been dropped (chips for `@src/a.ts` and `@src/b.ts`)
- **AND** the user deletes `@src/a.ts` from the textarea
- **THEN** only the `a.ts` chip SHALL be removed
- **AND** the `b.ts` chip SHALL remain visible

#### Scenario: Editing @path without full deletion keeps chip
- **WHEN** a file has been dropped and a chip is visible for `@src/App.tsx`
- **AND** the user edits the text to `@src/App.test.tsx` (changing the filename but keeping an `@path`)
- **THEN** the original chip for `App.tsx` SHALL be removed (the exact `@src/App.tsx` no longer exists)

### Requirement: Help text reflects actual capabilities
The help text in `commands.ts` SHALL accurately describe available image input methods without claiming unsupported features.

#### Scenario: Help text corrected
- **WHEN** the `/?` or `/help` command is issued
- **THEN** the image/vision section SHALL NOT claim "In Web UI: drag & drop, paste, or click to upload images" if drag-and-drop or click-to-upload are not fully implemented
- **AND** the text SHALL describe only currently supported methods: pasting images via Ctrl+V
