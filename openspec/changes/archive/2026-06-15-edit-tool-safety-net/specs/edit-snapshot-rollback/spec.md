## ADDED Requirements

### Requirement: edit tool captures snapshot before applying batch

Before applying any edit operations to a file, the `edit` tool SHALL automatically capture a snapshot of the complete file content. The snapshot SHALL be stored in-memory keyed by the file's absolute path. The snapshot capture SHALL occur after all validation passes but before the first file write.

#### Scenario: Snapshot captured on successful edit
- **WHEN** the model calls `edit` with valid operations that pass all validation
- **THEN** a snapshot of the file's pre-edit content SHALL be stored before any changes are written
- **AND** the edit response SHALL include `snapshot_id` in its details

#### Scenario: No snapshot captured on rejected edit
- **WHEN** the model calls `edit` with operations that fail validation (e.g., stale anchor)
- **THEN** no snapshot SHALL be captured
- **AND** the edit response SHALL NOT include `snapshot_id`

#### Scenario: No snapshot captured on dry-run
- **WHEN** the model calls `edit` with `dry_run: true`
- **THEN** no snapshot SHALL be captured (file is unchanged)

### Requirement: Snapshot is per-file, one-deep

Only the most recent snapshot per file path SHALL be retained. When `edit` is called on a file that already has a stored snapshot, the old snapshot SHALL be overwritten with the new pre-edit content before the edit is applied.

#### Scenario: Second edit overwrites previous snapshot
- **WHEN** the model calls `edit` on file A (creating snapshot S1), then calls `edit` on file A again
- **THEN** the second edit SHALL overwrite S1 with the current pre-edit content before applying changes
- **AND** only the second snapshot SHALL be available for undo

### Requirement: edit_undo tool restores from snapshot

A new tool `edit_undo` SHALL be available in the tool registry. It SHALL accept a `path` parameter (absolute file path). When called, it SHALL restore the file at `path` to its pre-edit snapshot content, write the restored content to disk, and clear the snapshot for that path. If no snapshot exists for the path, `edit_undo` SHALL return an error indicating no snapshot is available.

#### Scenario: Successful undo restores file
- **WHEN** the model calls `edit_undo` with `path` pointing to a file that has a stored snapshot
- **THEN** the file SHALL be restored to the exact content it had before the last `edit` call
- **AND** the snapshot SHALL be cleared
- **AND** the response SHALL include `restored: true` and the new `file_version`

#### Scenario: Undo with no snapshot returns error
- **WHEN** the model calls `edit_undo` with `path` pointing to a file that has no stored snapshot
- **THEN** the response SHALL include `restored: false` and an error message indicating no snapshot exists
- **AND** the file on disk SHALL remain unchanged

#### Scenario: Undo after dry-run has no effect
- **WHEN** the model calls `edit` with `dry_run: true` (no snapshot captured), then calls `edit_undo` on the same file
- **THEN** `edit_undo` SHALL return an error indicating no snapshot exists (dry-run does not capture snapshots)

### Requirement: edit_undo output includes new anchors

After restoring a file, `edit_undo` SHALL return a localized diff showing the change (restored content vs. corrupted content) with new anchor hashes, matching the format used by `edit` tool's diff output. The diff SHALL use `+` prefix for restored lines and `-` prefix for removed corrupted lines.

#### Scenario: Undo diff shows restoration
- **WHEN** the model calls `edit_undo` and the file is successfully restored
- **THEN** the response SHALL include a diff section with new anchor hashes
- **AND** restored lines SHALL be prefixed with `+` and corrupted lines with `-`

#### Scenario: Undo warns about stale anchors
- **WHEN** the model calls `edit_undo` and the file is successfully restored
- **THEN** the response SHALL include a notice that previous anchors for this file are stale and must be re-read
