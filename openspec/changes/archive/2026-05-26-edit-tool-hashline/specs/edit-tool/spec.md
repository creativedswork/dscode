## ADDED Requirements

### Requirement: edit tool replaces a single line by hash

The `edit` tool SHALL support `op: "replace_line"` which replaces exactly one line identified by its hash with new content. The operation MUST fail if the hash does not match any line in the current file.

#### Scenario: Successful single line replacement
- **WHEN** the model calls `edit` with `op: "replace_line"`, a valid `hash` matching line 3 of the current file, and `content: "  return x + 1;"`
- **THEN** line 3 of the file SHALL be replaced with `"  return x + 1;"` and all other lines SHALL remain unchanged

#### Scenario: replace_line with unknown hash
- **WHEN** the model calls `edit` with `op: "replace_line"` and a `hash` that does not correspond to any line in the current file
- **THEN** the edit SHALL be rejected, the file SHALL remain unchanged, and the error message SHALL include the unknown hash value

### Requirement: edit tool replaces a range of lines by hash range

The `edit` tool SHALL support `op: "replace_range"` which replaces all lines from `start_hash` (inclusive) through `end_hash` (inclusive) with new content. Both hashes MUST exist and `start_hash`'s line MUST precede or equal `end_hash`'s line.

#### Scenario: Successful range replacement
- **WHEN** the model calls `edit` with `op: "replace_range"`, `start_hash` matching line 5, `end_hash` matching line 8, and `content` containing 3 new lines
- **THEN** lines 5 through 8 SHALL be replaced with the 3 new lines, and surrounding lines SHALL remain unchanged

#### Scenario: replace_range with reversed hashes
- **WHEN** `start_hash` corresponds to a line number greater than `end_hash`'s line number
- **THEN** the edit SHALL be rejected with an error indicating the invalid range

### Requirement: edit tool inserts content after a line by hash

The `edit` tool SHALL support `op: "insert_after"` which inserts new content immediately after the line identified by the given hash.

#### Scenario: Successful insert after
- **WHEN** the model calls `edit` with `op: "insert_after"`, `hash` matching line 4, and `content: "  console.log('debug');\n  return result;"`
- **THEN** the new lines SHALL be inserted after line 4, and original line 5 and beyond SHALL shift down

### Requirement: edit tool inserts content before a line by hash

The `edit` tool SHALL support `op: "insert_before"` which inserts new content immediately before the line identified by the given hash.

#### Scenario: Successful insert before
- **WHEN** the model calls `edit` with `op: "insert_before"`, `hash` matching line 1, and `content: "// Copyright 2024\n"`
- **THEN** the new line SHALL be inserted before the original line 1, becoming the new line 1

### Requirement: edit tool deletes a single line by hash

The `edit` tool SHALL support `op: "delete_line"` which removes exactly one line identified by its hash.

#### Scenario: Successful line deletion
- **WHEN** the model calls `edit` with `op: "delete_line"` and a valid `hash` matching line 3
- **THEN** line 3 SHALL be removed and subsequent lines SHALL shift up

### Requirement: edit tool deletes a range of lines by hash range

The `edit` tool SHALL support `op: "delete_range"` which removes all lines from `start_hash` through `end_hash` (both inclusive).

#### Scenario: Successful range deletion
- **WHEN** the model calls `edit` with `op: "delete_range"`, `start_hash` matching line 2, `end_hash` matching line 4
- **THEN** lines 2, 3, and 4 SHALL be removed and line 5 SHALL become the new line 2

### Requirement: edit tool executes batch operations atomically

The `edit` tool SHALL accept an array of `operations` and execute them sequentially in order. Before any modification, the tool SHALL verify all referenced hashes exist in the current file. If any hash is invalid, the entire batch MUST be rejected and the file MUST remain unchanged.

#### Scenario: All-or-nothing batch rejection
- **WHEN** the model calls `edit` with 3 operations where the first two reference valid hashes but the third references an invalid hash
- **THEN** NO modifications SHALL be applied to the file, and the error SHALL list the invalid hash

#### Scenario: Sequential operations in batch
- **WHEN** the model calls `edit` with `[{op: "delete_line", hash: "a1b2"}, {op: "insert_after", hash: "c3d4", content: "new"}]`
- **THEN** the deletion SHALL be applied first, and the insertion SHALL use the hash-to-line mapping from the file as it existed at the start of the batch (not the post-deletion state)

### Requirement: edit tool validates hashes before any file modification

The `edit` tool SHALL re-read the target file and recompute hashes immediately before applying edits. This ensures the file has not been modified since the model last read it.

#### Scenario: File modified externally between read and edit
- **WHEN** the model reads a file with hashes, the file is modified externally, and the model calls `edit` with the previously seen hashes
- **THEN** the edit SHALL be rejected with a message indicating the file has changed and suggesting the model re-read the file

### Requirement: edit tool returns a summary of changes

Upon successful completion, the `edit` tool SHALL return a summary including the number of operations applied, the total number of lines added, and the total number of lines removed.

#### Scenario: Successful edit summary
- **WHEN** `edit` successfully applies 2 operations (one replacement, one insertion) resulting in +3 lines and -1 line
- **THEN** the return content SHALL include "2 operations applied" and indicate the net line change
