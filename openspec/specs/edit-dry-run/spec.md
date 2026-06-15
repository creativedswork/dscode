## ADDED Requirements

### Requirement: edit tool accepts dry_run parameter

The `edit` tool SHALL accept an optional boolean parameter `dry_run`. When `dry_run` is `true`, the tool SHALL execute the complete validation pipeline — hash resolution, disambiguation, entropy filtering, overlap detection, and safety checks — but SHALL NOT write any changes to the file. The response SHALL include all diagnostics that a real apply would produce.

#### Scenario: Dry-run validates successful edit without writing
- **WHEN** the model calls `edit` with `dry_run: true`, a valid `replace_line` operation with a unique hash, and content that passes all safety checks
- **THEN** the response SHALL include `dry_run: true`, `valid: true`, and per-operation diagnostics
- **AND** the file on disk SHALL remain unchanged

#### Scenario: Dry-run detects ambiguous anchor without writing
- **WHEN** the model calls `edit` with `dry_run: true` and a `replace_line` operation whose hash matches 3 candidate lines at all resolution levels
- **THEN** the response SHALL include `dry_run: true`, `valid: false`, and error `anchor_context_ambiguous` with candidate line numbers
- **AND** the file on disk SHALL remain unchanged

#### Scenario: Dry-run detects safety check failure without writing
- **WHEN** the model calls `edit` with `dry_run: true` and a `replace_range` operation that introduces an unbalanced `{`
- **THEN** the response SHALL include `dry_run: true`, `valid: false`, and `safety_status: "failed"` with per-operation diagnostics identifying the source line
- **AND** the file on disk SHALL remain unchanged

#### Scenario: Dry-run detects stale anchor without writing
- **WHEN** the model calls `edit` with `dry_run: true` and a hash that does not match any line in the current file
- **THEN** the response SHALL include `dry_run: true`, `valid: false`, and error `anchor_stale` with the unknown hash
- **AND** the file on disk SHALL remain unchanged

#### Scenario: Dry-run with no operations rejected
- **WHEN** the model calls `edit` with `dry_run: true` and an empty operations array
- **THEN** the call SHALL be rejected with error indicating no operations provided

### Requirement: Dry-run response mirrors real apply diagnostics

When `dry_run: true`, the edit tool's response SHALL include all diagnostic fields that a non-dry-run call would produce: `valid`, `operations` (with per-op `status`, `anchor_resolution`, `safety`), `auto_corrections`, `safety_status`, and `invalidation_scope`. The `invalidation_scope` in dry-run SHALL reflect what WOULD be invalidated if the edit were applied.

#### Scenario: Dry-run returns full invalidation scope
- **WHEN** the model calls `edit` with `dry_run: true` and operations affecting lines 10 through 15 of a 50-line file
- **THEN** the response SHALL include `invalidation_scope: { anchors_valid_through: 9, must_refresh_from_line: 10 }`
- **AND** the file on disk SHALL remain unchanged

#### Scenario: Dry-run returns auto-corrections
- **WHEN** the model calls `edit` with `dry_run: true` and `start_hash` resolves to a line after `end_hash`
- **THEN** the response SHALL include `auto_corrections` indicating the range order was swapped
- **AND** the file on disk SHALL remain unchanged

### Requirement: Dry-run omits fields that only apply on write

When `dry_run: true`, the edit response SHALL NOT include `file_version` (no new version since file is unchanged), `snapshot_id` (no snapshot taken since file is unchanged), or `syntax_check` (no syntax check since file is unchanged). The response SHALL include the `file_version` at the time of validation for staleness detection on subsequent real apply.

#### Scenario: Dry-run returns validation-time file version
- **WHEN** the model calls `edit` with `dry_run: true`
- **THEN** the response SHALL include `validated_at_file_version` containing the file version used for validation
- **AND** the response SHALL NOT include `file_version` or `snapshot_id`

### Requirement: Dry-run validates against live file, not stale cache

The dry-run SHALL resolve all anchors and perform all validation against the current file content on disk, not against a cached or previously-read snapshot. This ensures the validation reflects the actual file state at validation time.

#### Scenario: Dry-run uses current file content
- **WHEN** the model calls `edit` with `dry_run: true` after another process has modified the file
- **THEN** anchor resolution SHALL be performed against the current file content
- **AND** `validated_at_file_version` SHALL reflect the current file version
