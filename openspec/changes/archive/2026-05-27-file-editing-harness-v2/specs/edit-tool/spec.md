## ADDED Requirements

### Requirement: Edit operations support occurrence field for disambiguation
Single-line edit operations (replace_line, insert_after, insert_before, delete_line) SHALL support an optional `occurrence` field (1-indexed integer) that specifies which matching line to target when the hash matches multiple lines. If `occurrence` is omitted and the hash has multiple candidates, the edit SHALL be rejected with error `anchor_ambiguous`.

#### Scenario: replace_line with occurrence targets correct line
- **WHEN** the model calls `edit` with `op: "replace_line"`, `hash: "d41d"`, `occurrence: 3`, `content: "new content"`, and `hash` matches lines 2, 5, 7, and 12
- **THEN** line 7 (the 3rd occurrence) SHALL be replaced

#### Scenario: delete_line with occurrence 1 targets first match
- **WHEN** the model calls `edit` with `op: "delete_line"`, `hash: "d41d"`, `occurrence: 1`, and `hash` matches lines 2, 5, and 7
- **THEN** line 2 (the 1st occurrence) SHALL be deleted

### Requirement: Edit returns structured invalidation scope
Upon successful completion, the `edit` tool SHALL return `anchors_valid_through` and `must_refresh_from_line` fields in its `details`. These fields SHALL indicate the exact boundary between valid and stale anchor regions.

#### Scenario: Invalidation scope after middle-of-file edit
- **WHEN** `edit` successfully modifies lines 20-22 of a file
- **THEN** details SHALL contain `anchors_valid_through: 19` and `must_refresh_from_line: 20`

## MODIFIED Requirements

### Requirement: edit tool replaces a single line by hash

The `edit` tool SHALL support `op: "replace_line"` which replaces exactly one line identified by its hash with new content. If the hash matches multiple lines, the operation MUST include an `occurrence` field to disambiguate; otherwise the entire batch SHALL be rejected with error `anchor_ambiguous`. The operation MUST fail if the hash does not match any line in the current file.

#### Scenario: Successful single line replacement
- **WHEN** the model calls `edit` with `op: "replace_line"`, a valid `hash` matching uniquely to line 3 of the current file, and `content: "  return x + 1;"`
- **THEN** line 3 of the file SHALL be replaced with `"  return x + 1;"` and all other lines SHALL remain unchanged

#### Scenario: replace_line with unknown hash
- **WHEN** the model calls `edit` with `op: "replace_line"` and a `hash` that does not correspond to any line in the current file
- **THEN** the edit SHALL be rejected, the file SHALL remain unchanged, and the error message SHALL include the unknown hash value with error `anchor_stale`

#### Scenario: replace_line with ambiguous hash and no occurrence
- **WHEN** the model calls `edit` with `op: "replace_line"` and a `hash` that matches 3 different lines but no `occurrence` field is provided
- **THEN** the edit SHALL be rejected with error `anchor_ambiguous`, and details SHALL list all 3 candidate line numbers

### Requirement: edit tool replaces a range of lines by hash range

The `edit` tool SHALL support `op: "replace_range"` which replaces all lines from `start_hash` (inclusive) through `end_hash` (inclusive) with new content. Both hashes MUST exist and uniquely identify exactly one line each. The `start_hash`'s line MUST precede or equal `end_hash`'s line. If either hash matches multiple candidates, the edit SHALL be rejected with error `anchor_ambiguous`.

#### Scenario: Successful range replacement
- **WHEN** the model calls `edit` with `op: "replace_range"`, `start_hash` uniquely matching line 5, `end_hash` uniquely matching line 8, and `content` containing 3 new lines
- **THEN** lines 5 through 8 SHALL be replaced with the 3 new lines, and surrounding lines SHALL remain unchanged

#### Scenario: replace_range with ambiguous start_hash
- **WHEN** `start_hash` matches 2 candidate lines and `end_hash` matches exactly 1 line
- **THEN** the edit SHALL be rejected with error `anchor_ambiguous`, identifying `start_hash` as the ambiguous anchor

#### Scenario: replace_range with ambiguous end_hash
- **WHEN** `start_hash` matches exactly 1 line and `end_hash` matches 3 candidate lines
- **THEN** the edit SHALL be rejected with error `anchor_ambiguous`, identifying `end_hash` as the ambiguous anchor

#### Scenario: replace_range with reversed hashes
- **WHEN** `start_hash` corresponds to a line number greater than `end_hash`'s line number
- **THEN** the edit SHALL be rejected with error `invalid_range_order` indicating the invalid range

### Requirement: edit tool inserts content after a line by hash

The `edit` tool SHALL support `op: "insert_after"` which inserts new content immediately after the line identified by the given hash. If the hash matches multiple lines, the operation MUST include an `occurrence` field to disambiguate; otherwise the batch SHALL be rejected with error `anchor_ambiguous`.

#### Scenario: Successful insert after
- **WHEN** the model calls `edit` with `op: "insert_after"`, `hash` uniquely matching line 4, and `content: "  console.log('debug');\n  return result;"`
- **THEN** the new lines SHALL be inserted after line 4, and original line 5 and beyond SHALL shift down

#### Scenario: insert_after with ambiguous hash rejected
- **WHEN** the model calls `edit` with `op: "insert_after"`, `hash` matching 2 lines, and no `occurrence` field
- **THEN** the edit SHALL be rejected with error `anchor_ambiguous`

### Requirement: edit tool inserts content before a line by hash

The `edit` tool SHALL support `op: "insert_before"` which inserts new content immediately before the line identified by the given hash. If the hash matches multiple lines, the operation MUST include an `occurrence` field to disambiguate; otherwise the batch SHALL be rejected with error `anchor_ambiguous`.

#### Scenario: Successful insert before
- **WHEN** the model calls `edit` with `op: "insert_before"`, `hash` uniquely matching line 1, and `content: "// Copyright 2024\n"`
- **THEN** the new line SHALL be inserted before the original line 1, becoming the new line 1

### Requirement: edit tool deletes a single line by hash

The `edit` tool SHALL support `op: "delete_line"` which removes exactly one line identified by its hash. If the hash matches multiple lines, the operation MUST include an `occurrence` field to disambiguate; otherwise the batch SHALL be rejected with error `anchor_ambiguous`.

#### Scenario: Successful line deletion
- **WHEN** the model calls `edit` with `op: "delete_line"` and a valid `hash` uniquely matching line 3
- **THEN** line 3 SHALL be removed and subsequent lines SHALL shift up

### Requirement: edit tool deletes a range of lines by hash range

The `edit` tool SHALL support `op: "delete_range"` which removes all lines from `start_hash` through `end_hash` (both inclusive). Both hashes MUST exist and uniquely identify exactly one line each. If either hash matches multiple candidates, the edit SHALL be rejected with error `anchor_ambiguous`.

#### Scenario: Successful range deletion
- **WHEN** the model calls `edit` with `op: "delete_range"`, `start_hash` uniquely matching line 2, `end_hash` uniquely matching line 4
- **THEN** lines 2, 3, and 4 SHALL be removed and line 5 SHALL become the new line 2

#### Scenario: delete_range with ambiguous start_hash
- **WHEN** `start_hash` matches 2 candidate lines and `end_hash` matches exactly 1 line
- **THEN** the edit SHALL be rejected with error `anchor_ambiguous`

### Requirement: edit tool executes batch operations atomically

The `edit` tool SHALL accept an array of `operations` and execute them sequentially in order. Before any modification, the tool SHALL verify all referenced hashes exist in the current file and that no ambiguous anchors are present (unless disambiguated via `occurrence`). If any hash is invalid or ambiguous without disambiguation, the entire batch MUST be rejected and the file MUST remain unchanged. All operations in a batch operate on the same initial file snapshot; later operations do NOT use the results of earlier operations within the same batch.

#### Scenario: All-or-nothing batch rejection for invalid hash
- **WHEN** the model calls `edit` with 3 operations where the first two reference valid hashes but the third references an invalid hash
- **THEN** NO modifications SHALL be applied to the file, and the error SHALL list the invalid hash

#### Scenario: All-or-nothing batch rejection for ambiguous hash
- **WHEN** the model calls `edit` with 2 operations where the first has a unique hash and the second has an ambiguous hash without `occurrence`
- **THEN** NO modifications SHALL be applied and the error SHALL be `anchor_ambiguous`

#### Scenario: Sequential operations in batch use initial snapshot
- **WHEN** the model calls `edit` with `[{op: "delete_line", hash: "a1b2"}, {op: "insert_after", hash: "c3d4", content: "new"}]`
- **THEN** the deletion SHALL be applied first, and the insertion SHALL use the hash-to-line mapping from the file as it existed at the start of the batch (not the post-deletion state)

### Requirement: edit tool validates hashes before any file modification

The `edit` tool SHALL re-read the target file and recompute hashes immediately before applying edits. This ensures the file has not been modified since the model last read it. The validation SHALL detect both missing hashes (hash present at read time but not now) and ambiguous anchors (hash matches multiple lines without disambiguation).

#### Scenario: File modified externally between read and edit
- **WHEN** the model reads a file with hashes, the file is modified externally, and the model calls `edit` with the previously seen hashes
- **THEN** the edit SHALL be rejected with error `anchor_stale`, a message indicating the file has changed, and `suggested_action: "re-read_file"`

#### Scenario: File has duplicate content causing ambiguity
- **WHEN** the model reads a file with hashes and calls `edit` with a hash that matches multiple identical lines without `occurrence`
- **THEN** the edit SHALL be rejected with error `anchor_ambiguous` and details SHALL list all candidate lines

### Requirement: edit tool returns a summary of changes

Upon successful completion, the `edit` tool SHALL return a summary including the number of operations applied, the total line count before and after, the net line change, and the invalidation scope (`anchors_valid_through` and `must_refresh_from_line`). A localized diff with new anchors SHALL be included when there are context lines to display.

#### Scenario: Successful edit summary with invalidation scope
- **WHEN** `edit` successfully applies 2 operations (one replacement, one insertion) resulting in +3 lines and -1 line, affecting lines starting at line 12
- **THEN** the return SHALL include "2 operations applied", the net line change, `anchors_valid_through: 11`, `must_refresh_from_line: 12`, and a localized diff with new anchors
