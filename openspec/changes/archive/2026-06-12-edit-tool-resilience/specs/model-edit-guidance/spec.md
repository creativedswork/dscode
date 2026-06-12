## ADDED Requirements

### Requirement: System prompt includes edit tool best practices

The tool-use section of the system prompt SHALL include edit tool best practices covering: (a) anchor selection — prefer `recommended_anchors`, never use `[low]` quality hashes for `replace_range` endpoints, use `occurrence` for disambiguation; (b) post-rewrite behavior — after `write_file`/`overwrite_file`, re-read with `hashes: true` before any `edit`; (c) range operations — ensure start_hash precedes end_hash, prefer multiple `replace_line` for small (1-5 line) ranges; (d) safety checks — check per-operation delta report on rejection; (e) overlapping operations — split replace+insert on same hash into sequential edit calls.

#### Scenario: Best practices present in system prompt
- **WHEN** a new conversation is started with edit tool capability
- **THEN** the system prompt SHALL contain an "Edit Tool Best Practices" section with subsections for anchor selection, post-rewrite, range operations, safety checks, and overlapping operations

#### Scenario: Best practices reference specific error types
- **WHEN** the edit tool best practices section is rendered
- **THEN** it SHALL mention `anchor_stale`, `invalid_range_order`, `safety_check_failed`, and `overlapping_operations` as error types with corresponding prevention guidance

### Requirement: Full-rewrite cost signal injected contextually

When the model selects `write_file` or `overwrite_file` for a file that (a) exists, (b) has more than 30 lines, and (c) the estimated change size is less than 50 lines, the system SHALL inject a soft reminder into the context. The reminder SHALL indicate the file's line count, suggest using `edit` for small changes, and note the cost of a full rewrite (extra `read_file` round-trip for anchor refresh).

#### Scenario: Cost reminder for large file small change
- **WHEN** the model is about to call `write_file` on an existing file with 200 lines
- **AND** the estimated change is less than 50 lines
- **THEN** the context SHALL include a reminder suggesting `edit` operations instead
- **AND** the reminder SHALL mention the approximate token/latency cost of the extra round-trip

#### Scenario: No cost reminder for new files
- **WHEN** the model calls `write_file` to create a new file that does not yet exist
- **THEN** no cost reminder SHALL be injected

#### Scenario: No cost reminder for large changes
- **WHEN** the model calls `write_file` on an existing file with 200 lines and the estimated change exceeds 200 lines
- **THEN** no cost reminder SHALL be injected (full rewrite is appropriate)

#### Scenario: Cost reminder references file state
- **WHEN** a cost reminder is injected
- **THEN** it SHALL include the current file's line count and the last modification timestamp
