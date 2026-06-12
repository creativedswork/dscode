## ADDED Requirements

### Requirement: Safety check returns per-operation diagnostic details

When `safety_check_failed` occurs, the edit tool SHALL return a per-operation breakdown of brace, parenthesis, bracket, and HTML tag balance changes. Each operation in the batch SHALL have an entry with `op_index`, `hash`, `line` (the target line number), and `delta` showing the net change for each check category. The error message SHALL identify the specific operation(s) and line number(s) that caused the imbalance.

#### Scenario: Single operation causes brace imbalance
- **WHEN** `edit` applies a `replace_line` that introduces an unclosed `{` at line 45
- **THEN** the error SHALL include a per-operation entry for op_index 0 with `line: 45`, `braces: { net: +1 }`
- **AND** the error message SHALL identify line 45 as the source of the imbalance

#### Scenario: Multiple operations each contribute to imbalance
- **WHEN** `edit` applies two `replace_line` operations, the first adding +1 `{` at line 20 and the second adding +1 `{` at line 35
- **THEN** the error SHALL include per-operation entries for both op_index 0 (line 20, braces net +1) and op_index 1 (line 35, braces net +1)
- **AND** the total SHALL show `braces: net +2`

#### Scenario: HTML tag imbalance detected
- **WHEN** `edit` replaces a line in an HTML file such that a `<div>` tag is opened but not closed
- **THEN** the safety check SHALL detect the unclosed `div` tag
- **AND** the per-operation delta SHALL include `html_tags` with the unclosed tag name

#### Scenario: Balanced edit passes all checks
- **WHEN** `edit` applies operations that maintain brace, parenthesis, bracket, and HTML tag balance
- **THEN** `safety_status` SHALL be `"clean"`
- **AND** no per-operation diagnostic SHALL be returned (only summary)

### Requirement: Safety check supports configurable strictness

The `edit` tool SHALL accept an optional `safety_check` parameter with values `"strict"` (default), `"warn"`, or `"off"`. In `"strict"` mode, any imbalance SHALL cause rejection and rollback. In `"warn"` mode, the edit SHALL be applied but the response SHALL include `safety_warnings` with the per-operation diagnostic. In `"off"` mode, no safety checks SHALL be performed.

#### Scenario: strict mode rejects on imbalance (default)
- **WHEN** `edit` is called without `safety_check` parameter (or `safety_check: "strict"`) and the operations cause a brace imbalance
- **THEN** the edit SHALL be rejected, the file SHALL be rolled back, and the error SHALL include per-operation diagnostics

#### Scenario: warn mode applies but warns
- **WHEN** `edit` is called with `safety_check: "warn"` and the operations cause a brace imbalance
- **THEN** the edit SHALL be applied successfully
- **AND** the response SHALL include `safety_warnings` with per-operation diagnostics

#### Scenario: off mode skips all checks
- **WHEN** `edit` is called with `safety_check: "off"` and the operations cause a brace imbalance
- **THEN** the edit SHALL be applied successfully
- **AND** no `safety_warnings` SHALL be returned

### Requirement: Overlapping replace and insert operations are auto-merged

When a single batch contains both a `replace_line` and an `insert_after` (or `insert_before`) referencing the same hash, the edit tool SHALL automatically merge them into a single `replace_line` operation. The merged content SHALL be the result of applying the replacement and then the insertion in logical order. A warning SHALL be included in the response indicating the merge occurred.

#### Scenario: replace_line + insert_after on same hash merged
- **WHEN** `edit` receives `[{op: "replace_line", hash: "ab12cd", content: "newLine"}, {op: "insert_after", hash: "ab12cd", content: "insertedLine"}]`
- **THEN** the two operations SHALL be merged into a single `replace_line` with content `"newLine\ninsertedLine"`
- **AND** the response SHALL include a warning describing the auto-merge

#### Scenario: insert_before + replace_line on same hash merged
- **WHEN** `edit` receives `[{op: "insert_before", hash: "ab12cd", content: "prefix"}, {op: "replace_line", hash: "ab12cd", content: "newLine"}]`
- **THEN** the two operations SHALL be merged into a single `replace_line` with content `"prefix\nnewLine"`

#### Scenario: replace_line + delete_line on same hash rejected
- **WHEN** `edit` receives `[{op: "replace_line", hash: "ab12cd", content: "new"}, {op: "delete_line", hash: "ab12cd"}]`
- **THEN** the edit SHALL be rejected with error `overlapping_operations`
- **AND** the error SHALL indicate that `replace_line` and `delete_line` are semantically conflicting on the same target

#### Scenario: insert_after + insert_before on same hash rejected
- **WHEN** `edit` receives `[{op: "insert_after", hash: "ab12cd", content: "after"}, {op: "insert_before", hash: "ab12cd", content: "before"}]`
- **THEN** the edit SHALL be rejected with error `overlapping_operations`
- **AND** the error SHALL indicate the order of insertions is ambiguous
