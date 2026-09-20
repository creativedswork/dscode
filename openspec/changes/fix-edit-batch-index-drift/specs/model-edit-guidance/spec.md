## MODIFIED Requirements

### Requirement: Safety-check failures are authoritative

The tool-use section of the system prompt SHALL instruct the model that a `safety_check_failed` rejection from the `edit` tool (e.g. `unbalanced_braces`, `unbalanced_parens`, `unbalanced_brackets`, `duplicate_line`, `suspicious_extra_brace`, `orphan_else`) is an authoritative signal that the edit would have corrupted the file, NOT a false positive to be bypassed.

The model SHALL NOT retry with `safety_check: warn` or `safety_check: off` before re-reading the file and diagnosing the intended-versus-actual result. If the model believes the failure is a false positive, it SHALL first re-read the affected region with `read_file(hashes: true)` and confirm the cause.

#### Scenario: safety check rejected
- **WHEN** `edit` returns `safety_status: "failed"` with `unbalanced_braces: net +2`
- **THEN** the model SHALL treat this as corruption evidence and re-read the file to locate the drift
- **AND** the model SHALL NOT immediately retry with `safety_check: warn` or `safety_check: off`

#### Scenario: deliberate override requires diagnosis
- **WHEN** the model is confident the safety failure is a false positive
- **THEN** the model SHALL first re-read the affected region and document why the imbalance is intentional
- **AND** only then MAY the model retry with a relaxed `safety_check`

### Requirement: Re-read after multi-operation edits

The system prompt SHALL instruct the model that after applying an `edit` call with two or more operations, the model SHALL re-read the affected region with `read_file(hashes: true)` to verify the result matches intent (no duplicated lines, no lost target lines, balanced delimiters) before proceeding, rather than trusting the reported diff summary.

#### Scenario: multi-operation edit is verified
- **WHEN** the model applies an `edit` batch with 2+ operations
- **THEN** the model SHALL re-read the affected region before making further edits or declaring completion

#### Scenario: single-operation edit does not require re-read
- **WHEN** the model applies a single `replace_line` or `replace_range`
- **THEN** re-reading is optional (the safety check and reported result suffice)
