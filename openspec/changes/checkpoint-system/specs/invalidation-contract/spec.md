## MODIFIED Requirements

### Requirement: Edit tool returns invalidation scope on success

Upon successful completion, the `edit` tool SHALL return an invalidation contract in its `details` that explicitly declares which line-level anchors remain valid and from which line anchors must be refreshed. This SHALL include `anchors_valid_through` (the last 1-indexed line number whose anchors are guaranteed valid) and `must_refresh_from_line` (the first 1-indexed line number from which anchors are stale). The contract SHALL also include `baseline_continuity` (one of `"clean"` or `"mixed"`) indicating whether the file's writer history is consistent.

#### Scenario: Edit affecting middle of file returns precise invalidation

- **WHEN** `edit` applies operations affecting lines 12 through 15 of a 50-line file
- **THEN** details SHALL include `anchors_valid_through: 11`, `must_refresh_from_line: 12`, and `baseline_continuity`

#### Scenario: Edit at top of file invalidates all anchors

- **WHEN** `edit` applies an insert_before on line 1
- **THEN** details SHALL include `anchors_valid_through: 0` and `must_refresh_from_line: 1`, indicating no anchors remain valid

#### Scenario: Edit at end of file preserves most anchors

- **WHEN** `edit` applies a replace_line on line 47 of a 50-line file
- **THEN** details SHALL include `anchors_valid_through: 46` and `must_refresh_from_line: 47`
