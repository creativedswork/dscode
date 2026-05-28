## ADDED Requirements

### Requirement: At-file autocomplete in TUI
The TUI input editor SHALL trigger a fuzzy file path autocomplete when the user types `@` followed by text, using the existing `CombinedAutocompleteProvider` from pi-tui with the project directory as `basePath`.

#### Scenario: At-file trigger
- **WHEN** user types `@` in the TUI editor
- **THEN** the autocomplete dropdown SHALL appear with files from the project directory that match the text after `@`

#### Scenario: Fuzzy matching
- **WHEN** user types `@core` in the TUI editor
- **THEN** the autocomplete SHALL show files like `src/core/main.ts`, `src/core/config.ts` matching the fuzzy query

#### Scenario: Select file with Enter
- **WHEN** user navigates to a file in the autocomplete dropdown and presses Enter
- **THEN** the relative file path SHALL be inserted into the editor at the cursor position

#### Scenario: Select file with Tab
- **WHEN** user navigates to a file in the autocomplete dropdown and presses Tab
- **THEN** the relative file path SHALL be inserted into the editor at the cursor position

### Requirement: At-file autocomplete in Web UI
The web UI input textarea SHALL trigger a file path autocomplete dropdown when the user types `@` followed by text, powered by file listings fetched from the server via WebSocket.

#### Scenario: At-file trigger in web
- **WHEN** user types `@` in the web UI textarea
- **THEN** the client SHALL send a `file_list` command to the server and display a dropdown of matching file paths

#### Scenario: Debounced file listing
- **WHEN** user types additional characters after `@`
- **THEN** the client SHALL debounce `file_list` requests by 150ms before sending to the server

#### Scenario: Select file with click
- **WHEN** user clicks on a file in the autocomplete dropdown
- **THEN** the file path SHALL be inserted into the textarea at the cursor position

#### Scenario: Select file with Enter
- **WHEN** user presses Enter while a file is highlighted in the dropdown
- **THEN** the file path SHALL be inserted and the dropdown SHALL close

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
When a message containing `@path/to/file` references is submitted, the system SHALL resolve those references by reading the file contents and injecting them as markdown code blocks into the message text before it reaches the LLM.

#### Scenario: Single file reference
- **WHEN** user submits a message "Explain @src/core/main.ts"
- **THEN** the system SHALL replace `@src/core/main.ts` with a markdown code block containing the file contents, tagged with the inferred language

#### Scenario: Multiple file references
- **WHEN** user submits a message "Compare @src/a.ts and @src/b.ts"
- **THEN** both `@src/a.ts` and `@src/b.ts` SHALL be replaced with their respective file content code blocks

#### Scenario: Non-existent file
- **WHEN** user submits a message referencing `@nonexistent.txt`
- **THEN** the reference SHALL remain as-is in the text and a warning SHALL be shown to the user indicating the file was not found

#### Scenario: Binary file
- **WHEN** user submits a message referencing `@image.png`
- **THEN** the reference SHALL be skipped (left as-is) and a warning SHALL be shown indicating the file was skipped because it is binary or non-text

#### Scenario: File exceeds size limit
- **WHEN** user references a file larger than the configured max file size (default 50KB)
- **THEN** the file content SHALL be truncated at the limit with a `[...truncated...]` marker, and a warning SHALL be shown

#### Scenario: Too many file references
- **WHEN** user references more files than the configured max (default 5)
- **THEN** only the first N files SHALL be resolved, and a warning SHALL list which files were skipped

#### Scenario: Total content exceeds limit
- **WHEN** the total resolved content exceeds the configured max total size (default 200KB)
- **THEN** content SHALL be truncated and a warning SHALL be shown

#### Scenario: TUI resolution
- **WHEN** user submits a message in the TUI containing `@` references
- **THEN** resolution SHALL happen in `handleSubmit` before the text is passed to `agent.prompt()`

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
- **THEN** server responds with `{ "type": "file_list_result", "prefix": "src/co", "items": [{ "path": "src/core/main.ts", "isDir": false }, ...] }`

#### Scenario: Empty prefix
- **WHEN** client sends `{ "type": "file_list", "prefix": "" }`
- **THEN** server responds with up to 50 files from the project root directory

#### Scenario: Directory listing
- **WHEN** the `prefix` matches a directory path
- **THEN** the response SHALL include files within that directory (relative paths prefixed with the directory)

### Requirement: Configuration for at-file limits
The at-file resolution behavior SHALL be configurable via project or user settings.

#### Scenario: Override max files
- **WHEN** `.dscode/settings.json` contains `{ "atFileMaxFiles": 10 }`
- **THEN** the system SHALL resolve up to 10 file references per message

#### Scenario: Override max file size
- **WHEN** `.dscode/settings.json` contains `{ "atFileMaxFileSize": 100000 }`
- **THEN** the system SHALL allow files up to 100KB before truncation

#### Scenario: Default limits
- **WHEN** no settings are configured for at-file limits
- **THEN** the system SHALL use defaults: 5 files max, 50KB per file, 200KB total
