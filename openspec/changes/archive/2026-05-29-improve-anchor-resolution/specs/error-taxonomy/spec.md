## MODIFIED Requirements

### Requirement: Error codes use protocol-semantic taxonomy
All file operation tools (read_file, write_file, overwrite_file, edit) SHALL return structured error information in their `details` field using a semantic error taxonomy. Each error response SHALL include an `error` field with one of the defined error codes and, where applicable, a `suggested_action` field indicating the recommended recovery strategy.

#### Scenario: anchor_stale error
- **WHEN** `edit` receives an operation with a hash that does not exist in the current file
- **THEN** details SHALL contain `error: "anchor_stale"` and `suggested_action: "re-read_file"`

#### Scenario: anchor_context_ambiguous error
- **WHEN** `edit` receives an operation with a hash that matches multiple candidate lines after all resolution levels are exhausted (6-char, 8-char, context-augmented)
- **THEN** details SHALL contain `error: "anchor_context_ambiguous"` and `suggested_action: "re-read_with_context"`

#### Scenario: anchor_prefix_ambiguous error
- **WHEN** `edit` receives an operation with a hash where the 6-char hash is ambiguous but the 8-char resolution hash is also ambiguous, and context resolution has not yet been attempted
- **THEN** details SHALL contain `error: "anchor_prefix_ambiguous"` and `suggested_action: "use_context_anchor"`

#### Scenario: anchor_low_entropy error
- **WHEN** `edit` receives a single-line operation targeting a hash that resolves to a line classified as low-entropy
- **THEN** details SHALL contain `error: "anchor_low_entropy"`, the target line number, the line's content, and `suggested_action: "use_neighbor_anchor"` with up to 3 neighboring high-quality anchors before and after

#### Scenario: invalid_range_order error
- **WHEN** `edit` receives a `replace_range` or `delete_range` operation where the start_hash maps to a line number greater than the end_hash line number
- **THEN** the batch SHALL be rejected and details SHALL contain `error: "invalid_range_order"` with the start and end line numbers

#### Scenario: file_version_mismatch error
- **WHEN** `write_file` or `overwrite_file` is called with an `expected_file_version` that does not match the current file's version hash
- **THEN** details SHALL contain `error: "file_version_mismatch"`, the expected version, the current version, and `suggested_action: "re-read_file"`

#### Scenario: write_conflict error
- **WHEN** `write_file` attempts to overwrite an existing file and the version check fails
- **THEN** details SHALL contain `error: "write_conflict"`, the expected and current file versions, and `suggested_action: "re-read_file"`

#### Scenario: schema_invalid error
- **WHEN** any file operation tool receives parameters that fail schema validation
- **THEN** details SHALL contain `error: "schema_invalid"` with a description of the validation failure

#### Scenario: not_found error for missing files
- **WHEN** `read_file` is called with a path that does not exist
- **THEN** details SHALL contain `error: "not_found"`

### Requirement: Error details include suggested recovery action
When a recoverable error occurs (one that can be resolved by the agent through a different action), the `details` object SHALL include a `suggested_action` field with a machine-readable string indicating the recommended recovery strategy.

#### Scenario: Suggested action for stale anchors
- **WHEN** `edit` returns `anchor_stale`
- **THEN** `suggested_action` SHALL be `"re-read_file"`

#### Scenario: Suggested action for context ambiguity
- **WHEN** `edit` returns `anchor_context_ambiguous`
- **THEN** `suggested_action` SHALL be `"re-read_with_context"`

#### Scenario: Suggested action for prefix ambiguity
- **WHEN** `edit` returns `anchor_prefix_ambiguous`
- **THEN** `suggested_action` SHALL be `"use_context_anchor"`

#### Scenario: Suggested action for low-entropy anchor
- **WHEN** `edit` returns `anchor_low_entropy`
- **THEN** `suggested_action` SHALL be `"use_neighbor_anchor"`

#### Scenario: Suggested action for version mismatch
- **WHEN** `write_file` or `overwrite_file` returns `file_version_mismatch` or `write_conflict`
- **THEN** `suggested_action` SHALL be `"re-read_file"`

## ADDED Requirements

### Requirement: anchor_prefix_ambiguous and anchor_context_ambiguous are distinct errors
`anchor_prefix_ambiguous` SHALL indicate that the hash prefix matches multiple lines but progressive resolution may still succeed (the agent should try context-augmented anchors). `anchor_context_ambiguous` SHALL indicate that all resolution levels have been exhausted and the hash remains ambiguous even with context. The distinction enables the agent to choose different recovery strategies.

#### Scenario: prefix ambiguity allows retry with context
- **WHEN** `edit` returns `anchor_prefix_ambiguous`
- **THEN** the agent SHALL attempt the edit again using a context-augmented anchor or a neighboring high-quality line as the reference point

#### Scenario: context ambiguity requires full re-read
- **WHEN** `edit` returns `anchor_context_ambiguous`
- **THEN** the agent SHALL re-read the file with `read_file(hashes: true)` and select different anchors for the edit

### Requirement: anchor_low_entropy error includes neighbor suggestions
When an edit is rejected with `anchor_low_entropy`, the error details SHALL include `neighbor_anchors`: a list of up to 6 `"lineNum#hash"` strings (3 before and 3 after the target line) that are classified as `high` quality and can be used as alternative anchors.

#### Scenario: Low-entropy rejection with neighbor anchors
- **WHEN** `edit` rejects a `replace_line` with `anchor_low_entropy` targeting a `},` line at position 50
- **AND** lines 48, 49, and 52 are classified as `high` and lines 47, 51, 53 are classified as `low` or `med`
- **THEN** `details.neighbor_anchors` SHALL contain `["48#xxxxxx", "49#xxxxxx", "52#xxxxxx"]` (the high-quality lines within ±3 range)
