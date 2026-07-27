## MODIFIED Requirements

### Requirement: Image fileRefs SHALL have absolute paths injected into the prompt at submit time

When the TUI submit handler processes `fileRefs` from `FileTracker`, image file paths SHALL be included in the prompt text alongside the base64 image content. The paths SHALL use the same `📁 Attached files:` format already used for non-image fileRefs. The imageRefs' base64 image content SHALL continue to be resolved via `resolveFileRefs` as before — the path injection is additive, not a replacement.

#### Scenario: Single image file dropped

- **WHEN** user drags `screenshot.png` into the TUI
- **AND** user types "Describe this:" and presses Enter
- **THEN** the prompt sent to the model SHALL include `📁 Attached files:\n- \`/absolute/path/to/screenshot.png\``
- **AND** the prompt SHALL also include the base64 image content

#### Scenario: Multiple image files dropped

- **WHEN** user drags `a.png` and `b.png` into the TUI
- **AND** user submits
- **THEN** the prompt SHALL include both absolute paths in the `📁 Attached files:` block
- **AND** the prompt SHALL include base64 content for both images

#### Scenario: Mixed image and non-image files dropped

- **WHEN** user drags `doc.pdf` and `photo.png` into the TUI
- **AND** user submits
- **THEN** the prompt SHALL include `📁 Attached files:\n- \`/abs/path/doc.pdf\`\n- \`/abs/path/photo.png\``
- **AND** `photo.png` SHALL also be sent as base64 image content

#### Scenario: No files dropped — no injection

- **WHEN** user submits a message without any attached files
- **THEN** no `📁 Attached files:` block SHALL appear in the prompt

### Requirement: FileTracker SHALL support reverse lookup from display path to absolute path

`FileTracker` SHALL expose a `getAbsPath(displayPath: string): string | undefined` method that returns the absolute path for a given display path, or `undefined` if not found.

#### Scenario: Reverse lookup finds matching path

- **WHEN** `fileTracker.add("/Users/alice/img.png", projectPath)` returns `"img.png"`
- **AND** `fileTracker.getAbsPath("img.png")` is called
- **THEN** it SHALL return `"/Users/alice/img.png"`

#### Scenario: Reverse lookup returns undefined for unknown path

- **WHEN** `fileTracker.getAbsPath("nonexistent.png")` is called
- **AND** no entry with that display path exists
- **THEN** it SHALL return `undefined`

### Requirement: TUI SHALL reveal absolute file path when cursor is on a [file:xxx] placeholder

When the editor cursor moves onto a `[file:<displayPath>]` marker, the TUI attachment bar SHALL display the corresponding absolute path. When the cursor moves away, the attachment bar SHALL revert to showing only the display path.

#### Scenario: Cursor on file placeholder shows absolute path

- **WHEN** editor contains `[file:screenshot.png] text here`
- **AND** cursor is positioned within `[file:screenshot.png]`
- **THEN** the attachment bar SHALL display `/absolute/path/to/screenshot.png`

#### Scenario: Cursor moves away hides absolute path

- **WHEN** the attachment bar is showing an absolute path
- **AND** user moves cursor away from the `[file:xxx]` placeholder
- **THEN** the attachment bar SHALL revert to showing only the display path

#### Scenario: Multiple file placeholders — only cursor-target shows path

- **WHEN** editor contains `[file:a.png] [file:b.png]`
- **AND** cursor is on `[file:a.png]`
- **THEN** ONLY the absolute path for `a.png` SHALL be displayed in the attachment bar
