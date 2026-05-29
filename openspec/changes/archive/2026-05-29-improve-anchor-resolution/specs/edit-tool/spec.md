## MODIFIED Requirements

### Requirement: edit tool replaces a single line by hash

The `edit` tool SHALL support `op: "replace_line"` which replaces exactly one line identified by its hash with new content. The hash SHALL be a 6-character hexadecimal string from read_file(hashes: true). If the hash matches multiple lines, the tool SHALL first attempt adaptive resolution (longer hash, context-augmented matching) before rejecting. If the resolved target line is classified as low-entropy, the operation SHALL be rejected with error `anchor_low_entropy`. The operation MUST fail if the hash does not match any line in the current file.

#### Scenario: Successful single line replacement
- **WHEN** the model calls `edit` with `op: "replace_line"`, a valid 6-char `hash` matching uniquely to line 3 of the current file, and `content: "  return x + 1;"`
- **THEN** line 3 of the file SHALL be replaced with `"  return x + 1;"` and all other lines SHALL remain unchanged

#### Scenario: replace_line with unknown hash
- **WHEN** the model calls `edit` with `op: "replace_line"` and a `hash` that does not correspond to any line in the current file
- **THEN** the edit SHALL be rejected, the file SHALL remain unchanged, and the error message SHALL include the unknown hash value with error `anchor_stale`

#### Scenario: replace_line with ambiguous hash resolved by adaptive length
- **WHEN** the model calls `edit` with `op: "replace_line"` and a 6-char `hash` that matches 3 different lines at the 6-char level
- **AND** the 8-char resolution hash uniquely identifies the intended line
- **THEN** the edit SHALL succeed by internally resolving to the unique 8-char match

#### Scenario: replace_line targeting low-entropy line rejected
- **WHEN** the model calls `edit` with `op: "replace_line"` and a `hash` that resolves to a line classified as `low` (e.g., `},`)
- **THEN** the edit SHALL be rejected with error `anchor_low_entropy`, and details SHALL include the line number and suggested neighboring high-quality anchors

### Requirement: edit tool replaces a range of lines by hash range

The `edit` tool SHALL support `op: "replace_range"` which replaces all lines from `start_hash` (inclusive) through `end_hash` (inclusive) with new content. Both hashes SHALL be 6-character hex strings. Both hashes MUST uniquely identify exactly one line each. The `start_hash`'s line MUST precede or equal `end_hash`'s line. If either hash matches multiple candidates after adaptive resolution, the edit SHALL be rejected with error `anchor_context_ambiguous`.

#### Scenario: Successful range replacement
- **WHEN** the model calls `edit` with `op: "replace_range"`, `start_hash` uniquely matching line 5, `end_hash` uniquely matching line 8, and `content` containing 3 new lines
- **THEN** lines 5 through 8 SHALL be replaced with the 3 new lines, and surrounding lines SHALL remain unchanged

#### Scenario: replace_range with ambiguous start_hash after all resolution levels
- **WHEN** `start_hash` matches 2 candidate lines even after 8-char and context resolution, and `end_hash` matches exactly 1 line
- **THEN** the edit SHALL be rejected with error `anchor_context_ambiguous`, identifying `start_hash` as the ambiguous anchor

#### Scenario: replace_range with ambiguous end_hash after all resolution levels
- **WHEN** `start_hash` matches exactly 1 line and `end_hash` matches 3 candidate lines even after full resolution
- **THEN** the edit SHALL be rejected with error `anchor_context_ambiguous`, identifying `end_hash` as the ambiguous anchor

#### Scenario: replace_range with reversed hashes
- **WHEN** `start_hash` corresponds to a line number greater than `end_hash`'s line number
- **THEN** the edit SHALL be rejected with error `invalid_range_order` indicating the invalid range

### Requirement: edit tool inserts content after a line by hash

The `edit` tool SHALL support `op: "insert_after"` which inserts new content immediately after the line identified by a 6-character hash. The tool SHALL use adaptive resolution for ambiguous short hashes. If the resolved target line is classified as low-entropy, the operation SHALL be rejected with error `anchor_low_entropy`.

#### Scenario: Successful insert after
- **WHEN** the model calls `edit` with `op: "insert_after"`, `hash` uniquely matching line 4, and `content: "  console.log('debug');\n  return result;"`
- **THEN** the new lines SHALL be inserted after line 4, and original line 5 and beyond SHALL shift down

#### Scenario: insert_after targeting low-entropy line rejected
- **WHEN** the model calls `edit` with `op: "insert_after"` and a `hash` that resolves to a `low` line
- **THEN** the edit SHALL be rejected with error `anchor_low_entropy`

### Requirement: edit tool inserts content before a line by hash

The `edit` tool SHALL support `op: "insert_before"` which inserts new content immediately before the line identified by a 6-character hash. The tool SHALL use adaptive resolution for ambiguous short hashes. If the resolved target line is classified as low-entropy, the operation SHALL be rejected with error `anchor_low_entropy`.

#### Scenario: Successful insert before
- **WHEN** the model calls `edit` with `op: "insert_before"`, `hash` uniquely matching line 1, and `content: "// Copyright 2024\n"`
- **THEN** the new line SHALL be inserted before the original line 1, becoming the new line 1

### Requirement: edit tool deletes a single line by hash

The `edit` tool SHALL support `op: "delete_line"` which removes exactly one line identified by its 6-character hash. The tool SHALL use adaptive resolution for ambiguous short hashes. If the resolved target line is classified as low-entropy, the operation SHALL be rejected with error `anchor_low_entropy`.

#### Scenario: Successful line deletion
- **WHEN** the model calls `edit` with `op: "delete_line"` and a valid `hash` uniquely matching line 3
- **THEN** line 3 SHALL be removed and subsequent lines SHALL shift up

### Requirement: edit tool deletes a range of lines by hash range

The `edit` tool SHALL support `op: "delete_range"` which removes all lines from `start_hash` through `end_hash` (both inclusive). Both hashes SHALL be 6-character hex strings and MUST uniquely identify exactly one line each after adaptive resolution. If either hash remains ambiguous, the edit SHALL be rejected with error `anchor_context_ambiguous`.

#### Scenario: Successful range deletion
- **WHEN** the model calls `edit` with `op: "delete_range"`, `start_hash` uniquely matching line 2, `end_hash` uniquely matching line 4
- **THEN** lines 2, 3, and 4 SHALL be removed and line 5 SHALL become the new line 2

### Requirement: edit tool validates hashes before any file modification

The `edit` tool SHALL re-read the target file and recompute hashes immediately before applying edits. This ensures the file has not been modified since the model last read it. The validation SHALL apply the full resolution ladder: 6-char hash → 8-char hash → context-augmented matching. It SHALL detect missing hashes (hash present at read time but not now), ambiguous anchors that exhaust all resolution levels, and low-entropy target lines.

#### Scenario: File modified externally between read and edit
- **WHEN** the model reads a file with hashes, the file is modified externally, and the model calls `edit` with the previously seen hashes
- **THEN** the edit SHALL be rejected with error `anchor_stale`, a message indicating the file has changed, and `suggested_action: "re-read_file"`

#### Scenario: File has duplicate content causing ambiguity at all resolution levels
- **WHEN** the model reads a file with hashes and calls `edit` with a hash that matches multiple identical lines at all resolution levels (6-char, 8-char, context)
- **THEN** the edit SHALL be rejected with error `anchor_context_ambiguous` and details SHALL list all candidate lines with content previews

### Requirement: edit tool returns a summary of changes

Upon successful completion, the `edit` tool SHALL return a summary including the number of operations applied, the total line count before and after, the net line change, and the invalidation scope (`anchors_valid_through` and `must_refresh_from_line`). A localized diff with new anchors SHALL be included when there are context lines to display. New anchors in the diff SHALL use 6-character hashes with quality annotations.

#### Scenario: Successful edit summary with invalidation scope
- **WHEN** `edit` successfully applies 2 operations (one replacement, one insertion) resulting in +3 lines and -1 line, affecting lines starting at line 12
- **THEN** the return SHALL include "2 operations applied", the net line change, `anchors_valid_through: 11`, `must_refresh_from_line: 12`, and a localized diff with new 6-char anchors

## ADDED Requirements

### Requirement: edit tool uses context-augmented hash for disambiguation
When the 6-char and 8-char hashes both produce multiple matches, the edit tool SHALL compute a context-augmented hash for each candidate line using the three-line window `prev_nonempty + current + next_nonempty`. If exactly one candidate matches the model-provided hash in context-augmented form, the tool SHALL resolve to that line silently.

#### Scenario: Context-augmented resolution succeeds
- **WHEN** `edit` receives a hash that matches lines 10 and 25 at both 6-char and 8-char levels
- **AND** the context-augmented hash for line 10 is `"cafebabe"` and for line 25 is `"deadbeef"`
- **AND** the model's intended target is line 25
- **THEN** the tool SHALL resolve to line 25 without returning an error

### Requirement: Low-entropy single-line operations return structured rejection
When a single-line edit operation is rejected due to a low-entropy target line, the error response SHALL include the target line number, the line's content, and a list of neighboring high-quality anchors (up to 3 before and 3 after) that the model can use instead.

#### Scenario: Low-entropy rejection with neighbor suggestions
- **WHEN** `edit` rejects a `replace_line` targeting a `},` line at position 118
- **AND** lines 119 and 120 are classified as `high`
- **THEN** the error details SHALL include `neighbor_anchors: ["119#c812f1", "120#a3f1b2"]` suggesting those as alternative anchors
