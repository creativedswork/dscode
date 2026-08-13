## ADDED Requirements

### Requirement: At-file autocomplete in TUI
The TUI input editor SHALL trigger a fuzzy file path autocomplete when the user types `@` followed by text, using the existing `CombinedAutocompleteProvider` from pi-tui with the project directory as `basePath`.

#### Scenario: At-file trigger
- **WHEN** user types `@` in the TUI editor
- **THEN** the autocomplete dropdown SHALL appear with files from the project directory that match the text after `@`

#### Scenario: Fuzzy matching
- **WHEN** user types `@core` in the TUI editor
- **THEN** the autocomplete SHALL show files like `src/bootstrap/cli-main.ts`, `src/config/loader.ts` matching the fuzzy query

#### Scenario: Select file with Enter
- **WHEN** user navigates to a file in the autocomplete dropdown and presses Enter
- **THEN** the `@` symbol followed by the relative file path SHALL be inserted into the editor at the cursor position, preserving any whitespace before the `@`

#### Scenario: Select file with Tab
- **WHEN** user navigates to a file in the autocomplete dropdown and presses Tab
- **THEN** the `@` symbol followed by the relative file path SHALL be inserted into the editor at the cursor position, preserving any whitespace before the `@`

### Requirement: At-file autocomplete in Web UI
The web UI input textarea SHALL trigger a file path autocomplete dropdown when the user types `@` followed by text, powered by file listings fetched from the server via WebSocket. The `@` SHALL be recognized when preceded by whitespace, start-of-input, or CJK characters (Unicode range `\u2e80-\u9fff\uff00-\uffef`). The autocomplete SHALL NOT trigger when the text following `@` consists entirely of CJK characters without any path separators (`/`, `\`) or file extension patterns.

#### Scenario: At-file trigger in web
- **WHEN** user types `@` in the web UI textarea
- **THEN** the client SHALL send a `file_list` command to the server and display a dropdown of matching file paths

#### Scenario: At-file trigger after CJK character
- **WHEN** user types `的@src` in the web UI textarea with cursor immediately after `@src`
- **THEN** the client SHALL recognize `@src` as a file reference and display the autocomplete dropdown

#### Scenario: CJK text after @ does not trigger autocomplete
- **WHEN** user types `@我们` in the web UI textarea
- **THEN** the client SHALL NOT display the file autocomplete dropdown because the text after `@` is purely CJK with no path indicators

#### Scenario: CJK text with extension triggers autocomplete
- **WHEN** user types `@我们.txt` in the web UI textarea
- **THEN** the client SHALL recognize `@我们.txt` as a file reference and display the autocomplete dropdown

#### Scenario: Debounced file listing
- **WHEN** user types additional characters after `@`
- **THEN** the client SHALL debounce `file_list` requests by 150ms before sending to the server

#### Scenario: Select file with click
- **WHEN** user clicks on a file in the autocomplete dropdown
- **THEN** the file path SHALL be inserted into the textarea at the cursor position

#### Scenario: Select file with Enter
- **WHEN** user presses Enter while a file is highlighted in the dropdown
- **THEN** the file path SHALL be inserted and the dropdown SHALL close

#### Scenario: Select directory with Enter continues autocomplete
- **WHEN** user presses Enter while a directory is highlighted in the dropdown
- **THEN** the directory path followed by `/` SHALL be inserted into the `@` reference without trailing whitespace, and the autocomplete SHALL remain open with the directory as the listing prefix

#### Scenario: Select directory with Tab continues autocomplete
- **WHEN** user presses Tab while a directory is highlighted in the dropdown
- **THEN** the directory path followed by `/` SHALL be inserted into the `@` reference without trailing whitespace, and the autocomplete SHALL remain open with the directory as the listing prefix

#### Scenario: Close dropdown with Escape
- **WHEN** user presses Escape while the file dropdown is open
- **THEN** the dropdown SHALL close without inserting anything

#### Scenario: Dropdown keyboard navigation
- **WHEN** user presses ArrowDown or ArrowUp while the file dropdown is open
- **THEN** the highlight SHALL move through the file list

#### Scenario: No match
- **WHEN** server returns an empty file list for the given prefix
- **THEN** the dropdown SHALL show a "No matching files" message

### Requirement: At-file reference resolution on submit
When a message containing `@path/to/file` references is submitted, the system SHALL resolve those references by reading the file contents. For text files, the content SHALL be injected as markdown code blocks. For image files, the content SHALL be base64-encoded and included in the images array for vision pipeline processing. The `@` SHALL be recognized when preceded by whitespace, start-of-string, or CJK characters (Unicode range `\u2e80-\u9fff\uff00-\uffef`). Captured text after `@` that consists entirely of CJK characters without path separators or file extension patterns SHALL be silently ignored (treated as plain text).

#### Scenario: Single text file reference
- **WHEN** user submits a message "Explain @src/bootstrap/cli-main.ts"
- **THEN** the system SHALL replace `@src/bootstrap/cli-main.ts` with a markdown code block containing the file contents, tagged with the inferred language

#### Scenario: File reference after CJK character
- **WHEN** user submits a message "请参考项目里的@src/utils.ts文件"
- **THEN** the system SHALL recognize `@src/utils.ts` as a file reference and resolve it

#### Scenario: CJK text after @ is ignored
- **WHEN** user submits a message "@我们今天去看一下"
- **THEN** the system SHALL NOT attempt to resolve `@我们` as a file path and SHALL leave the text unchanged

#### Scenario: Image file reference
- **WHEN** user submits a message "Describe @screenshot.png" and the file is within the image size limit (default 20MB)
- **THEN** the system SHALL read the file as base64 and include it in the images array
- **AND** the text reference SHALL be replaced with `[Image: @screenshot.png]`

#### Scenario: Image file exceeds image size limit — submission rejected
- **WHEN** user submits a message "Describe @large-photo.jpg" and the file exceeds `atFileMaxImageSize` (default 20MB)
- **THEN** the system SHALL reject the entire prompt submission
- **AND** display a warning: "@large-photo.jpg: exceeds max image size (20MB)"
- **AND** the prompt SHALL NOT be sent to the model

#### Scenario: Multiple file references
- **WHEN** user submits a message "Compare @src/a.ts and @src/b.ts"
- **THEN** both `@src/a.ts` and `@src/b.ts` SHALL be replaced with their respective file content code blocks

#### Scenario: Non-existent file
- **WHEN** user submits a message referencing `@nonexistent.txt`
- **THEN** the reference SHALL remain as-is in the text and a warning SHALL be shown to the user indicating the file was not found

#### Scenario: Non-image binary file
- **WHEN** user submits a message referencing a binary file with an extension not in the image set (e.g., `@data.zip`, `@audio.mp3`)
- **THEN** the reference SHALL be skipped (left as-is) and a warning SHALL be shown indicating the file was skipped because it is binary or non-text

#### Scenario: Text file exceeds size limit
- **WHEN** user references a text file larger than the configured max file size (default 50KB)
- **THEN** the file content SHALL be truncated at the limit with a `[...truncated...]` marker, and a warning SHALL be shown

#### Scenario: Too many file references
- **WHEN** user references more files than the configured max (default 5)
- **THEN** only the first N files SHALL be resolved, and a warning SHALL list which files were skipped

#### Scenario: Total text content exceeds limit
- **WHEN** the total resolved text content exceeds the configured max total size (default 200KB)
- **THEN** text content SHALL be truncated and a warning SHALL be shown
- **AND** image file sizes SHALL NOT count toward this total

#### Scenario: TUI resolution
- **WHEN** user submits a message in the TUI containing `@` references
- **THEN** resolution SHALL happen in `handleSubmit` before the text is passed to `agent.prompt()` or `promptWithImages()`

#### Scenario: Web UI resolution
- **WHEN** a `chat` command arrives at the server from the web client
- **THEN** the server SHALL resolve `@` references in the text before passing to the agent

### Requirement: At-file warning display
The system SHALL display warnings to the user when file references cannot be fully resolved.

#### Scenario: File not found warning
- **WHEN** a referenced file does not exist
- **THEN** a warning SHALL appear: "File not found: path/to/file"

#### Scenario: Truncation warning
- **WHEN** a file is truncated due to size limits
- **THEN** a warning SHALL appear: "File truncated at 50KB: path/to/file"

#### Scenario: Max files exceeded warning
- **WHEN** the max files limit is exceeded
- **THEN** a warning SHALL appear listing the skipped files: "Skipped {N} file(s): path1, path2, ..."

### Requirement: WebSocket file_list protocol
The server SHALL support a `file_list` client command that returns matching files from the project directory, and the client SHALL send it when the user types `@` in the input.

#### Scenario: Client requests file list
- **WHEN** client sends `{ "type": "file_list", "prefix": "src/co" }`
- **THEN** server responds with `{ "type": "file_list_result", "prefix": "src/co", "items": [{ "path": "src/bootstrap/cli-main.ts", "isDir": false }, ...] }`

#### Scenario: Empty prefix
- **WHEN** client sends `{ "type": "file_list", "prefix": "" }`
- **THEN** server responds with up to 50 files from the project root directory

#### Scenario: Directory listing
- **WHEN** the `prefix` matches a directory path
- **THEN** the response SHALL include files within that directory (relative paths prefixed with the directory)

### Requirement: Configuration for at-file limits
The at-file resolution behavior SHALL be configurable via project or user settings, including separate size limits for text files and image files.

#### Scenario: Override max files
- **WHEN** `.dscode/settings.json` contains `{ "atFileMaxFiles": 10 }`
- **THEN** the system SHALL resolve up to 10 file references per message

#### Scenario: Override max file size
- **WHEN** `.dscode/settings.json` contains `{ "atFileMaxFileSize": 100000 }`
- **THEN** the system SHALL allow text files up to 100KB before truncation

#### Scenario: Override image size limit
- **WHEN** `.dscode/settings.json` contains `{ "atFileMaxImageSize": 10485760 }`
- **THEN** the system SHALL allow image files up to 10MB before rejecting the submission

#### Scenario: Default limits
- **WHEN** no settings are configured for at-file limits
- **THEN** the system SHALL use defaults: 5 files max, 50KB per text file, 20MB per image file, 200KB total text content

#### Scenario: Text file size limit unchanged by image config
- **WHEN** `atFileMaxImageSize` is configured but `atFileMaxFileSize` is not
- **THEN** text files SHALL still use the default 50KB limit from `atFileMaxFileSize`

### Requirement: Absolute path resolution for at-file references
The at-file resolver's `safeResolveWithin` SHALL accept absolute paths that point to existing files, in addition to paths within the project directory.

#### Scenario: Absolute path to file inside project
- **WHEN** user submits a message containing `@/Users/x/project/src/bootstrap/cli-main.ts` (absolute path to a file within the project directory)
- **THEN** the resolver SHALL resolve and read the file normally, the same as the relative `@src/bootstrap/cli-main.ts`

#### Scenario: Absolute path to file outside project
- **WHEN** user submits a message containing `@/Users/x/Downloads/report.pdf` (absolute path to a file outside the project directory)
- **THEN** the resolver SHALL NOT reject it as `path_escape`
- **AND** the resolver SHALL check that the file exists at the given absolute path
- **AND** if the file exists, it SHALL be processed according to the same file-type rules (text, image, binary) as project files

#### Scenario: Absolute path to non-existent file
- **WHEN** user submits a message containing `@/tmp/nonexistent.txt` (absolute path to a file that does not exist)
- **THEN** the resolver SHALL report a `not_found` warning, the same as for a non-existent relative path

#### Scenario: Relative path still restricted to project
- **WHEN** user submits a message containing `@../../etc/passwd` (relative path escaping the project directory)
- **THEN** the resolver SHALL still reject it with a `path_escape` warning
- **AND** only absolute paths (starting with `/`) are permitted to reference files outside the project

### Requirement: resolveFileRefs resolves an explicit array of file paths
The system SHALL provide `resolveFileRefs(projectPath, fileRefs, limits?)` that resolves an explicit array of absolute file paths into message content, returning the same `AtFileResolveResult` type as `resolveAtFileRefs`.

#### Scenario: Resolve fileRefs with text and image files
- **WHEN** `resolveFileRefs(projectPath, ["/path/to/app.ts", "/path/to/logo.png"], limits)` is called
- **THEN** `app.ts` SHALL be resolved as a markdown code block with inferred language
- **AND** `logo.png` SHALL be resolved as an `ImageRef` in the `images` array
- **AND** the result SHALL have the same shape as `resolveAtFileRefs` output

#### Scenario: Resolve fileRefs with missing file
- **WHEN** `resolveFileRefs(projectPath, ["/nonexistent.txt"])` is called
- **THEN** a `not_found` warning SHALL be returned
- **AND** the `reject` flag SHALL be `false` (warn but don't block)

#### Scenario: Resolve fileRefs with empty array
- **WHEN** `resolveFileRefs(projectPath, [])` is called
- **THEN** the result SHALL have empty `text`, empty `images`, and no warnings

#### Scenario: Limits apply to fileRefs
- **WHEN** `fileRefs` has more entries than `maxFiles` allows
- **THEN** only the first `maxFiles` entries SHALL be resolved
- **AND** a `too_many_files` warning SHALL list the skipped files

#### Scenario: FileRefs respect file size and total size limits
- **WHEN** a file exceeds `maxFileSize`
- **THEN** its content SHALL be truncated with a `truncated` warning
- **WHEN** total resolved content exceeds `maxTotalSize`
- **THEN** content SHALL be truncated with a `total_truncated` warning
