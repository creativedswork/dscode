## MODIFIED Requirements

### Requirement: edit tool returns a summary of changes

Upon successful completion, the `edit` tool SHALL return a summary including the number of operations applied, the total line count before and after, the net line change, and the invalidation scope (`anchors_valid_through` and `must_refresh_from_line`). A localized diff with new anchors SHALL be included when there are context lines to display. New anchors in the diff SHALL use 6-character hashes with quality annotations. The response SHALL include `baseline_continuity` (one of `"clean"` or `"mixed"`) and `writer_type` (always `"edit"`) in its `details`.

#### Scenario: Successful edit summary with invalidation scope

- **WHEN** `edit` successfully applies 2 operations (one replacement, one insertion) resulting in +3 lines and -1 line, affecting lines starting at line 12
- **THEN** the return SHALL include "2 operations applied", the net line change, `anchors_valid_through: 11`, `must_refresh_from_line: 12`, a localized diff with new 6-char anchors, `baseline_continuity: "clean"`, and `writer_type: "edit"`

## ADDED Requirements

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
