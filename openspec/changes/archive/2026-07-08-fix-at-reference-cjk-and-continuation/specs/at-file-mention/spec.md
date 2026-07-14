## MODIFIED Requirements

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
When a message containing `@path/to/file` references is submitted, the system SHALL resolve those references by reading the file contents and injecting them as markdown code blocks into the message text before it reaches the LLM. The `@` SHALL be recognized when preceded by whitespace, start-of-string, or CJK characters (Unicode range `\u2e80-\u9fff\uff00-\uffef`). Captured text after `@` that consists entirely of CJK characters without path separators or file extension patterns SHALL be silently ignored (treated as plain text).

#### Scenario: Single file reference
- **WHEN** user submits a message "Explain @src/core/main.ts"
- **THEN** the system SHALL replace `@src/core/main.ts` with a markdown code block containing the file contents, tagged with the inferred language

#### Scenario: File reference after CJK character
- **WHEN** user submits a message "请参考项目里的@src/utils.ts文件"
- **THEN** the system SHALL recognize `@src/utils.ts` as a file reference and resolve it

#### Scenario: CJK text after @ is ignored
- **WHEN** user submits a message "@我们今天去看一下"
- **THEN** the system SHALL NOT attempt to resolve `@我们` as a file path and SHALL leave the text unchanged

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
