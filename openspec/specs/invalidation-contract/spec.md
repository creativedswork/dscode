# invalidation-contract Specification

## Purpose
TBD - created by archiving change file-editing-harness-v2. Update Purpose after archive.
## Requirements
### Requirement: Edit tool returns invalidation scope on success
Upon successful completion, the `edit` tool SHALL return an invalidation contract in its `details` that explicitly declares which line-level anchors remain valid and from which line anchors must be refreshed. This SHALL include `anchors_valid_through` (the last 1-indexed line number whose anchors are guaranteed valid) and `must_refresh_from_line` (the first 1-indexed line number from which anchors are stale).

#### Scenario: Edit affecting middle of file returns precise invalidation
- **WHEN** `edit` applies operations affecting lines 12 through 15 of a 50-line file
- **THEN** details SHALL include `anchors_valid_through: 11` and `must_refresh_from_line: 12`

#### Scenario: Edit at top of file invalidates all anchors
- **WHEN** `edit` applies an insert_before on line 1
- **THEN** details SHALL include `anchors_valid_through: 0` and `must_refresh_from_line: 1`, indicating no anchors remain valid

#### Scenario: Edit at end of file preserves most anchors
- **WHEN** `edit` applies a replace_line on line 47 of a 50-line file
- **THEN** details SHALL include `anchors_valid_through: 46` and `must_refresh_from_line: 47`

### Requirement: Edit tool returns new file version on success
Upon successful completion, the `edit` tool SHALL return the new `file_version` in its `details` field. This version SHALL be computed from the complete post-edit file content and SHALL be usable as `expected_file_version` for subsequent `write_file` or `overwrite_file` calls.

#### Scenario: Edit returns new file version
- **WHEN** `edit` successfully modifies a file
- **THEN** details SHALL contain `file_version` with a string value beginning with `fv_`

### Requirement: Edit tool returns localized diff with new anchors
Upon successful completion, the `edit` tool SHALL include a localized diff in its output text showing the changed region with 3 lines of context before and after. Each line in the diff SHALL be prefixed with its new anchor in `lineNumber#hash|content` format.

#### Scenario: Diff includes new anchors for changed region
- **WHEN** `edit` replaces lines 10-12 in a file
- **THEN** the output text SHALL contain a diff section with lines 7-15 (3 lines context on each side), each prefixed with its new anchor

#### Scenario: Diff marks added, removed, and unchanged lines
- **WHEN** `edit` applies a `replace_range` that results in net line count change
- **THEN** the diff SHALL use `-` prefix for removed lines, `+` prefix for added lines, and ` ` prefix for unchanged context lines

### Requirement: Edit tool explicitly declares old anchors are stale
Upon successful completion, the `edit` tool SHALL include a note in its output text warning that anchors outside the displayed diff region are stale and must be re-read before editing other regions.

#### Scenario: Stale anchor warning appears in edit output
- **WHEN** `edit` successfully modifies a file
- **THEN** the output text SHALL contain a notice equivalent to "anchors outside the displayed diff may be stale. Re-read if you need to edit other regions."


The contract SHALL also include `baseline_continuity` (one of `"clean"` or `"mixed"`) indicating whether the file's writer history is consistent.
