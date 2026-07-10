## MODIFIED Requirements

### Requirement: At-file reference resolution on submit
When a message containing `@path/to/file` references is submitted, the system SHALL resolve those references by reading the file contents. For text files, the content SHALL be injected as markdown code blocks. For image files, the content SHALL be base64-encoded and included in the images array for vision pipeline processing. The text reference SHALL be replaced with an appropriate indicator.

#### Scenario: Single text file reference
- **WHEN** user submits a message "Explain @src/core/main.ts"
- **THEN** the system SHALL replace `@src/core/main.ts` with a markdown code block containing the file contents, tagged with the inferred language

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

## ADDED Requirements

### Requirement: Separate image size configuration
The at-file resolution behavior SHALL support a separate `atFileMaxImageSize` configuration for image files, distinct from `atFileMaxFileSize` which applies to text files only.

#### Scenario: Override image size limit
- **WHEN** `.dscode/settings.json` contains `{ "atFileMaxImageSize": 10485760 }`
- **THEN** the system SHALL allow image files up to 10MB before skipping them

#### Scenario: Default image size limit
- **WHEN** no `atFileMaxImageSize` is configured
- **THEN** the system SHALL use 20,971,520 bytes (20MB) as the default image size limit

#### Scenario: Text file size limit unchanged
- **WHEN** `atFileMaxImageSize` is configured but `atFileMaxFileSize` is not
- **THEN** text files SHALL still use the default 50KB limit from `atFileMaxFileSize`
