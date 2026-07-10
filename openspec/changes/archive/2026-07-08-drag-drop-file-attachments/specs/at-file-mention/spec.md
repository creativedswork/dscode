## ADDED Requirements

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
