## ADDED Requirements

### Requirement: edit tool accepts path parameter

The `edit` tool SHALL accept `path` as the primary parameter for specifying the target file path. The parameter SHALL be a required string field in the Zod schema.

#### Scenario: edit called with path parameter
- **WHEN** the model calls `edit` with `path: "/app/foo.ts"` and valid operations
- **THEN** the edit SHALL proceed normally

#### Scenario: edit called without path parameter
- **WHEN** the model calls `edit` without `path` (and without deprecated `file_path`)
- **THEN** the call SHALL fail with a parameter validation error indicating `path` is required

### Requirement: edit tool accepts deprecated file_path parameter (transitional)

The `edit` tool SHALL accept `file_path` as a deprecated alias for `path` during a 4-week transition period. When `file_path` is used, the tool SHALL emit a deprecation warning. If both `path` and `file_path` are provided, `path` SHALL take precedence.

#### Scenario: edit called with deprecated file_path
- **WHEN** the model calls `edit` with `file_path: "/app/foo.ts"` and no `path`
- **THEN** the call SHALL succeed
- **AND** the response SHALL include a deprecation warning indicating `file_path` is deprecated and `path` should be used instead

#### Scenario: edit called with both path and file_path
- **WHEN** the model calls `edit` with both `path: "/app/foo.ts"` and `file_path: "/app/bar.ts"`
- **THEN** `path` SHALL take precedence and the file `/app/foo.ts` SHALL be edited

## MODIFIED Requirements

### Requirement: edit tool replaces a range of lines by hash range

The `edit` tool SHALL support `op: "replace_range"` which replaces all lines from `start_hash` (inclusive) through `end_hash` (inclusive) with new content. Both hashes SHALL be 6-character hex strings. Both hashes MUST uniquely identify exactly one line each. If the resolved start line is after the resolved end line, the tool SHALL automatically swap the two endpoints and include an `auto_corrections` entry in the response. If either hash matches multiple candidates after adaptive resolution, the edit SHALL be rejected with error `anchor_context_ambiguous`.

#### Scenario: Successful range replacement
- **WHEN** the model calls `edit` with `op: "replace_range"`, `start_hash` uniquely matching line 5, `end_hash` uniquely matching line 8, and `content` containing 3 new lines
- **THEN** lines 5 through 8 SHALL be replaced with the 3 new lines, and surrounding lines SHALL remain unchanged

#### Scenario: replace_range with ambiguous start_hash after all resolution levels
- **WHEN** `start_hash` matches 2 candidate lines even after 8-char and context resolution, and `end_hash` matches exactly 1 line
- **THEN** the edit SHALL be rejected with error `anchor_context_ambiguous`, identifying `start_hash` as the ambiguous anchor

#### Scenario: replace_range with ambiguous end_hash after all resolution levels
- **WHEN** `start_hash` matches exactly 1 line and `end_hash` matches 3 candidate lines even after full resolution
- **THEN** the edit SHALL be rejected with error `anchor_context_ambiguous`, identifying `end_hash` as the ambiguous anchor

#### Scenario: replace_range with reversed hashes auto-corrected
- **WHEN** `start_hash` corresponds to line 791 and `end_hash` corresponds to line 17 (start after end)
- **THEN** the tool SHALL automatically swap the two endpoints
- **AND** the edit SHALL proceed with lines 17 through 791 as the range
- **AND** the response SHALL include `auto_corrections: [{type: "range_order_swapped", detail: "start_line (791) was after end_line (17). Swapped automatically."}]`

#### Scenario: replace_range with same line for both hashes rejected
- **WHEN** `start_hash` and `end_hash` both resolve to the same line
- **THEN** the edit SHALL be rejected with error `invalid_range_order`
- **AND** the error SHALL indicate the range is a no-op (start equals end)

### Requirement: edit tool supports cross-version best-effort recovery

When `expected_file_version` is provided but does not match the current file version, the edit tool SHALL attempt cross-version recovery before rejecting. If ALL operation hashes are found in the current file and are unambiguous, the edit SHALL proceed with a `cross_version: true` warning. If any hash is missing, the edit SHALL be rejected with precise diagnostics including `missing_hashes` and `suggested_nearby` candidates.

#### Scenario: Level 1 — file version matches
- **WHEN** `expected_file_version` matches the current file version
- **THEN** the edit SHALL proceed normally with no cross-version warning

#### Scenario: Level 2 — version mismatches but all hashes valid
- **WHEN** `expected_file_version` does not match the current file version
- **AND** all operation hashes exist and are unique in the current file
- **THEN** the edit SHALL proceed and apply all operations
- **AND** the response SHALL include `warning: "cross_version"` indicating the file was modified since the snapshot but anchors were still valid

#### Scenario: Level 3 — version mismatches with missing hashes
- **WHEN** `expected_file_version` does not match the current file version
- **AND** one or more hashes do not exist in the current file
- **THEN** the edit SHALL be rejected with error `cross_version_conflict`
- **AND** the response SHALL include `missing_hashes` listing the hashes that could not be found
- **AND** the response SHALL include `suggested_nearby` with nearby line candidates for each missing hash

#### Scenario: Version mismatches with ambiguous hash
- **WHEN** `expected_file_version` does not match the current file version
- **AND** a hash exists but matches multiple lines
- **THEN** the edit SHALL be rejected with error `cross_version_conflict` + `anchor_ambiguous`
- **AND** no partial execution SHALL occur (all-or-nothing)
