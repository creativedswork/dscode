# tui-file-drop-path-ref Specification

## Purpose
TBD - created by archiving change fix-tui-file-drag-drop. Update Purpose after archive.
## Requirements
### Requirement: Non-image drag-drop files inject path references only
When non-image files are attached via drag-and-drop and the user submits the message, the system SHALL inject only absolute path references into the Agent prompt, without reading the file contents.

#### Scenario: Submit with one non-image file
- **WHEN** user drags `/Users/x/Downloads/config.json` into the TUI and submits with text "check this"
- **THEN** the Agent prompt SHALL contain `📁 Attached files:\n- \`/Users/x/Downloads/config.json\``
- **AND** the file content SHALL NOT be read or injected into the prompt
- **AND** the prompt SHALL also contain the user's text "check this"

#### Scenario: Submit with multiple non-image files
- **WHEN** user drags `/tmp/a.ts`, `/tmp/b.json`, `/tmp/c.md` into the TUI and submits
- **THEN** the Agent prompt SHALL contain a path reference for each file on separate lines
- **AND** no file contents SHALL be read

#### Scenario: Submit with mixed image and non-image files
- **WHEN** user drags `photo.png`, `config.json`, `types.ts` into the TUI and submits
- **THEN** the image file (`photo.png`) SHALL be processed through `resolveFileRefs` and enter the ImagePipeline as normal
- **AND** the non-image files (`config.json`, `types.ts`) SHALL appear as path references only
- **AND** the path references SHALL use the absolute file path

#### Scenario: Submit with only non-image files and no user text
- **WHEN** user drags `config.json` into the TUI and submits without typing any text
- **THEN** the Agent prompt SHALL contain the path reference
- **AND** the prompt SHALL NOT be empty or rejected

#### Scenario: Non-image file has been deleted since drop
- **WHEN** user drags a file that was subsequently deleted from disk and submits
- **THEN** the path reference SHALL still be injected (the path string itself is valid)
- **AND** the Agent will receive a "not found" error if it attempts to `read_file`

### Requirement: Image drag-drop files continue to use ImagePipeline
When image files are attached via drag-and-drop, the system SHALL continue to process them through the existing `resolveFileRefs` → ImagePipeline flow, unchanged from current behavior.

#### Scenario: Submit with only image files
- **WHEN** user drags `photo.png` into the TUI and submits
- **THEN** the image SHALL be read and processed through ImagePipeline
- **AND** the Agent prompt SHALL contain the image description (via `<image_description>`)

#### Scenario: Image file with non-native-image-support model
- **WHEN** user drags `photo.jpg` and the current model does not support native image input
- **THEN** the image SHALL go through the vision model or OCR fallback as normal
- **AND** the Agent SHALL NOT receive raw base64 in the prompt

