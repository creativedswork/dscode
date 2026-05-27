## ADDED Requirements

### Requirement: Error codes use protocol-semantic taxonomy
All file operation tools (read_file, write_file, overwrite_file, edit) SHALL return structured error information in their `details` field using a semantic error taxonomy. Each error response SHALL include an `error` field with one of the defined error codes and, where applicable, a `suggested_action` field indicating the recommended recovery strategy.

#### Scenario: anchor_stale error
- **WHEN** `edit` receives an operation with a hash that does not exist in the current file
- **THEN** details SHALL contain `error: "anchor_stale"` and `suggested_action: "re-read_file"`

#### Scenario: anchor_ambiguous error
- **WHEN** `edit` receives an operation with a hash that matches multiple candidate lines without disambiguation
- **THEN** details SHALL contain `error: "anchor_ambiguous"` and `suggested_action: "re-read_with_context"`

#### Scenario: anchor_not_found error
- **WHEN** `edit` receives an operation with a hash that has never existed in the file (not a stale issue but an invalid anchor)
- **THEN** details SHALL contain `error: "anchor_not_found"` — distinct from `anchor_stale` which implies the file changed since last read

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

#### Scenario: Suggested action for ambiguity
- **WHEN** `edit` returns `anchor_ambiguous`
- **THEN** `suggested_action` SHALL be `"re-read_with_context"`

#### Scenario: Suggested action for version mismatch
- **WHEN** `write_file` or `overwrite_file` returns `file_version_mismatch` or `write_conflict`
- **THEN** `suggested_action` SHALL be `"re-read_file"`

### Requirement: anchor_stale and anchor_not_found are distinct errors
`anchor_stale` SHALL indicate that a hash was valid at read time but no longer matches (the file has been modified). `anchor_not_found` SHALL indicate that the hash format is unrecognized or the anchor has never existed. The distinction enables the agent to choose different recovery strategies: re-read for stale anchors vs. reformat for unrecognized anchors.

#### Scenario: anchor_stale with missingHashes
- **WHEN** `edit` validation finds hashes that are not in the current file's hash map
- **THEN** details SHALL contain `error: "anchor_stale"` and `missingHashes: ["hash1", "hash2"]`

#### Scenario: anchor_not_found for malformed anchor
- **WHEN** `edit` receives an anchor in an unrecognized format that cannot be parsed as a valid hash
- **THEN** details SHALL contain `error: "anchor_not_found"` describing the format issue
