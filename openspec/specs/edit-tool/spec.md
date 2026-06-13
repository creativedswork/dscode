## Purpose

The `edit` tool provides content-addressable file editing using hash-based anchors. It replaces traditional line-number-based or string-replace editing with an anchor-guarded protocol where line identity is determined by content hash, and line numbers serve only as advisory snapshot positions.
## Requirements
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

#### Scenario: Successful range replacement (duplicate)
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

The `edit` tool SHALL re-read the target file and recompute hashes immediately before applying edits. This ensures the file has not been modified since the model last read it. The validation SHALL apply the full resolution ladder: 6-char hash → 8-char hash → context-augmented matching. It SHALL detect missing hashes (hash present at read time but not now), ambiguous anchors that exhaust all resolution levels, and low-entropy target lines.

#### Scenario: File modified externally between read and edit
- **WHEN** the model reads a file with hashes, the file is modified externally, and the model calls `edit` with the previously seen hashes
- **THEN** the edit SHALL be rejected with error `anchor_stale`, a message indicating the file has changed, and `suggested_action: "re-read_file"`

#### Scenario: File has duplicate content causing ambiguity at all resolution levels
- **WHEN** the model reads a file with hashes and calls `edit` with a hash that matches multiple identical lines at all resolution levels (6-char, 8-char, context)
- **THEN** the edit SHALL be rejected with error `anchor_context_ambiguous` and details SHALL list all candidate lines with content previews

### Requirement: edit tool returns a summary of changes

Upon successful completion, the `edit` tool SHALL return a summary including the number of operations applied, the total line count before and after, the net line change, and the invalidation scope (`anchors_valid_through` and `must_refresh_from_line`). A localized diff with new anchors SHALL be included when there are context lines to display. New anchors in the diff SHALL use 6-character hashes with quality annotations. The response SHALL include `baseline_continuity` (one of `"clean"` or `"mixed"`) and `writer_type` (always `"edit"`) in its `details`.

#### Scenario: Successful edit summary with invalidation scope
- **WHEN** `edit` successfully applies 2 operations (one replacement, one insertion) resulting in +3 lines and -1 line, affecting lines starting at line 12
- **THEN** the return SHALL include "2 operations applied", the net line change, `anchors_valid_through: 11`, `must_refresh_from_line: 12`, a localized diff with new 6-char anchors, `baseline_continuity: "clean"`, and `writer_type: "edit"`

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


### Requirement: edit tool checkpoints file before modification

Before applying any edit operations, the `edit` tool SHALL save a checkpoint of the target file via CheckpointManager. After applying and running sanity checks, if `safety_status` is `"clean"`, the checkpoint SHALL be committed. If `safety_status` is `"suspicious"`, the file SHALL be rolled back to the checkpoint and the edit SHALL be rejected.

#### Scenario: Clean edit commits checkpoint
- **WHEN** `edit` successfully applies operations and sanity check returns `"clean"`
- **THEN** the checkpoint for that file SHALL be committed (removed)
- **AND** the response shall indicate the edit was applied

#### Scenario: Suspicious edit rolls back
- **WHEN** `edit` applies operations that produce sanity warnings (e.g., duplicate lines, unbalanced braces)
- **THEN** the file SHALL be rolled back to the checkpoint state
- **AND** the edit SHALL be rejected with `error: "safety_check_failed"`
- **AND** the response SHALL include the `safety_warnings` that triggered the rollback

### Requirement: edit tool records writer before modification

Before applying edit operations, the `edit` tool SHALL record itself as the writer for the target file via FileWriteTracker. The `baseline_continuity` in the response SHALL reflect whether the file was previously written by a different writer type.

#### Scenario: edit on file previously modified by write_file reports mixed
- **WHEN** `edit` is called on a file that was previously written by `write_file`
- **THEN** the response details SHALL include `baseline_continuity: "mixed"`
- **AND** the edit SHALL still proceed (宽松模式: no rejection)

#### Scenario: edit on file only modified by edit reports clean
- **WHEN** `edit` is called on a file that was previously only modified by `edit`
- **THEN** the response details SHALL include `baseline_continuity: "clean"`



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

### Requirement: System prompt SHALL instruct model to apply edits promptly after reading anchors

The system prompt SHALL include guidance requiring the model to apply edits to a file in the same response turn or the immediate next turn after reading its anchors with `read_file(hashes: true)`. The guidance SHALL warn that reading file A, then reading file B, then later editing file A will cause stale-anchor cross-version conflicts. The guidance SHALL direct the model to process one file completely (read → edit) before reading anchors for another file.

#### Scenario: Anchor-freshness guidance present in system prompt
- **WHEN** the system prompt is assembled for an agent session
- **THEN** the edit tool description SHALL contain language substantially equivalent to: "After reading a file with `read_file(hashes: true)`, apply edits to that file in the same response turn or the immediate next turn. Do not read file A, then read file B, then later edit file A — the anchors from A will be stale and cause cross-version conflicts. Process one file completely (read → edit) before reading anchors for another file."

### Requirement: System prompt SHALL instruct model on anchor quality selection

The system prompt SHALL include guidance directing the model to prefer lines with unique, distinctive content as edit anchors. It SHALL warn against anchoring on empty lines, closing braces (`}`), or frequently repeated boilerplate (e.g., `position: fixed;`, `display: flex;` in CSS, `</div>` in HTML). For files with repetitive content, it SHALL recommend `replace_range` with two unique boundary anchors instead of `replace_line`. When a `replace_line` anchor matches multiple lines, it SHALL instruct use of the `occurrence` field (1-indexed) and `line` field (advisory line number) together for disambiguation.

#### Scenario: Anchor-selection guidance present in system prompt
- **WHEN** the system prompt is assembled for an agent session
- **THEN** the edit tool description SHALL contain language substantially equivalent to: "Anchor selection guidance: Prefer lines with unique, distinctive content as anchors. Avoid anchoring on empty lines, closing braces (`}`), or frequently repeated boilerplate (e.g., `position: fixed;`, `display: flex;` in CSS, `</div>` in HTML). For files with repetitive content, use `replace_range` with two unique boundary anchors instead of `replace_line` — range operations enforce uniqueness on both endpoints and are rejected if ambiguous. When a `replace_line` anchor matches multiple lines, use the `occurrence` field (1-indexed) and `line` field (advisory line number) together to disambiguate."

### Requirement: System prompt SHALL provide operation-selection matrix for edit tool

The system prompt SHALL include a reference table mapping common editing situations to the recommended edit operation. The table SHALL cover at minimum: changing a single unique-content line (`replace_line`), changing a contiguous block of lines (`replace_range`), inserting new content between existing lines (`insert_after` / `insert_before`), removing a single unique line (`delete_line`), removing a contiguous block of lines (`delete_range`), and handling repetitive target lines via `replace_range` with unique neighbor anchors.

#### Scenario: Operation-selection matrix present in system prompt
- **WHEN** the system prompt is assembled for an agent session
- **THEN** the Tool Use Rules section or edit tool description SHALL contain a table with at minimum these rows:

| Situation | Recommended Operation |
|-----------|----------------------|
| Change a single line with unique content | `replace_line` |
| Change a contiguous block of lines | `replace_range` |
| Insert new content between two existing lines | `insert_after` / `insert_before` |
| Remove a single unique line | `delete_line` |
| Remove a contiguous block of lines | `delete_range` |
| Target line is repetitive (empty line, `}`, boilerplate) | `replace_range` wrapping it with unique neighbor anchors |

### Requirement: System prompt SHALL instruct model on multi-file editing order

The system prompt SHALL include guidance requiring the model to complete all operations on one file before moving to the next when modifying multiple files. It SHALL direct the model to batch operations targeting the same file into a single `edit` call where possible, noting that all operations in one call are atomic against the same snapshot. It SHALL instruct the model to avoid interleaving reads and edits across different files, enforcing the pattern read A → edit A → read B → edit B instead of read A → read B → edit A → edit B.

#### Scenario: Multi-file editing order guidance present in system prompt
- **WHEN** the system prompt is assembled for an agent session
- **THEN** the Tool Use Rules section SHALL contain language substantially equivalent to: "Multi-file editing: When modifying multiple files, complete all operations on one file before moving to the next. Batch operations targeting the same file into a single `edit` call where possible (all operations in one call are atomic against the same snapshot). Avoid interleaving reads and edits across different files — read A → edit A → read B → edit B, not read A → read B → edit A → edit B."

### Requirement: System prompt SHALL document edit tool parameter constraints

The system prompt SHALL include a parameter-usage note documenting that `path` is the required file-specification field and `file_path` is deprecated and will be rejected. It SHALL distinguish single-anchor operations (`replace_line`, `delete_line`, `insert_after`, `insert_before`) which use the `hash` field from dual-anchor operations (`replace_range`, `delete_range`) which use `start_hash` + `end_hash`. It SHALL warn that mixing these (e.g., `start_hash` on a `replace_line`) causes validation failure.

#### Scenario: Parameter constraint documentation present in system prompt
- **WHEN** the system prompt is assembled for an agent session
- **THEN** the edit tool description SHALL contain language substantially equivalent to:

"Parameter notes:
- Use `path` to specify the file; `file_path` is deprecated and will be rejected.
- `replace_line` / `delete_line` / `insert_after` / `insert_before` use `hash` (single anchor).
- `replace_range` / `delete_range` use `start_hash` + `end_hash` (two anchors).
- Mixing these (e.g., `start_hash` on a `replace_line`) causes validation failure."

### Requirement: Edit tool description SHALL include anchor-hash identity disclaimer

The edit tool description in the system prompt SHALL include a disclaimer that line numbers in `read_file` output are advisory snapshot positions only, and the hash is the authoritative identity for edit operations. This requirement ensures the model understands the content-addressable nature of the anchor protocol before receiving usage guidance.

#### Scenario: Anchor-hash identity disclaimer present
- **WHEN** the system prompt is assembled for an agent session
- **THEN** the edit tool description SHALL contain language substantially equivalent to: "the line number is advisory (snapshot position) only, and the hash is the authoritative identity for edit operations"
