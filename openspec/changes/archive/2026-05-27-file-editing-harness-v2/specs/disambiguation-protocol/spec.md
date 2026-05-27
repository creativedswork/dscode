## ADDED Requirements

### Requirement: Single-line operations reject ambiguous anchors
When a single-line edit operation (replace_line, insert_after, insert_before, delete_line) references a hash that matches multiple candidate lines in the current file, the edit SHALL be rejected with error `anchor_ambiguous` unless the operation includes an `occurrence` field specifying which matching line to target.

#### Scenario: Ambiguous single-line operation without occurrence
- **WHEN** the model calls `edit` with `op: "replace_line"`, `hash: "d41d"` where `d41d` matches 3 distinct empty lines in the file, and no `occurrence` field is provided
- **THEN** the entire batch SHALL be rejected with error `anchor_ambiguous`, and the error details SHALL include the hash and all candidate line numbers (e.g., `candidates: [2, 5, 12]`)

#### Scenario: Single-line operation with valid occurrence resolves ambiguity
- **WHEN** the model calls `edit` with `op: "replace_line"`, `hash: "d41d"`, `occurrence: 2`, and `hash` matches lines 2, 5, and 12
- **THEN** the operation SHALL target line 5 (the 2nd occurrence) and succeed

#### Scenario: Single-line operation with out-of-range occurrence
- **WHEN** the model calls `edit` with `op: "replace_line"`, `hash: "d41d"`, `occurrence: 5`, but `hash` only matches 3 lines
- **THEN** the batch SHALL be rejected with error `anchor_ambiguous` and details SHALL indicate the occurrence is out of range (only 3 candidates exist)

### Requirement: Range operations reject ambiguous endpoint anchors
When a range edit operation (delete_range, replace_range) has a start_hash or end_hash that matches multiple candidate lines, the edit SHALL be rejected with error `anchor_ambiguous` regardless of whether an `occurrence` field is provided. Range operations SHALL NOT support occurrence-based disambiguation due to the elevated risk of catastrophic misalignment.

#### Scenario: Range operation with ambiguous start anchor
- **WHEN** the model calls `edit` with `op: "delete_range"`, `start_hash: "d41d"` matching 3 candidate lines, and `end_hash: "abc1"` matching exactly 1 line
- **THEN** the batch SHALL be rejected with error `anchor_ambiguous`, and details SHALL identify `start_hash` as the ambiguous anchor with all candidate line numbers

#### Scenario: Range operation with ambiguous end anchor
- **WHEN** the model calls `edit` with `op: "replace_range"`, `start_hash: "abc1"` matching exactly 1 line, and `end_hash: "d41d"` matching 4 candidate lines
- **THEN** the batch SHALL be rejected with error `anchor_ambiguous`, and details SHALL identify `end_hash` as the ambiguous anchor with all candidate line numbers

#### Scenario: Range operation with non-ambiguous anchors succeeds
- **WHEN** the model calls `edit` with `op: "replace_range"`, both `start_hash` and `end_hash` matching exactly 1 line each, and the start line precedes the end line
- **THEN** the operation SHALL execute normally, replacing the range

### Requirement: anchor_ambiguous error includes structured candidate information
When an `anchor_ambiguous` error is returned, the error details SHALL include the ambiguous hash(es), all candidate line numbers for each ambiguous hash, and a `suggested_action` field set to `"re-read_with_context"`.

#### Scenario: Structured ambiguity error
- **WHEN** `edit` returns `anchor_ambiguous` for a batch with hash `"d41d"` matching lines 3, 7, and 15
- **THEN** details SHALL contain `ambiguous_anchors: [{hash: "d41d", candidates: [3, 7, 15]}]` and `suggested_action: "re-read_with_context"`
