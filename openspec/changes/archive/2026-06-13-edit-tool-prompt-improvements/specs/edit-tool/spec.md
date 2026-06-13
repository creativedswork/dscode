## ADDED Requirements

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
