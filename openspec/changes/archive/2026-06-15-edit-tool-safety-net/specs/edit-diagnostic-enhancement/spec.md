## MODIFIED Requirements

### Requirement: Safety check supports configurable strictness

The `edit` tool SHALL accept an optional `safety_check` parameter with values `"strict"` (default), `"warn"`, or `"off"`. In `"strict"` mode, any imbalance SHALL cause rejection and rollback. In `"warn"` mode, the edit SHALL be applied but the response SHALL include `safety_warnings` with the per-operation diagnostic. In `"off"` mode, no safety checks SHALL be performed. When `dry_run: true`, the `safety_check` parameter SHALL still apply: `"strict"` returns diagnostics as a validation failure (no rollback needed since no write), `"warn"` returns diagnostics as warnings with `valid: true`, and `"off"` skips safety checks entirely.

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

#### Scenario: dry-run with strict mode returns diagnostics as validation failure
- **WHEN** `edit` is called with `dry_run: true` and `safety_check: "strict"` and the operations cause a brace imbalance
- **THEN** the response SHALL include `valid: false`
- **AND** the response SHALL include `safety_status: "failed"` with per-operation diagnostics
- **AND** no changes SHALL be written to the file

#### Scenario: dry-run with warn mode returns diagnostics as warnings
- **WHEN** `edit` is called with `dry_run: true` and `safety_check: "warn"` and the operations cause a brace imbalance
- **THEN** the response SHALL include `valid: true` (dry-run validated successfully)
- **AND** the response SHALL include `safety_warnings` with per-operation diagnostics
- **AND** no changes SHALL be written to the file

## ADDED Requirements

### Requirement: Safety check runs in dry-run mode

When `dry_run: true`, the safety check SHALL be executed as part of the validation pipeline, producing the same per-operation diagnostics it would for a real apply. The difference is behavioral: in dry-run mode, `safety_check: "strict"` with imbalance SHALL produce a validation failure (`valid: false`) rather than a rejection + rollback (since no write occurred).

#### Scenario: Dry-run safety check produces diagnostics identical to real apply
- **WHEN** `edit` is called with `dry_run: true` and operations that would fail safety check in strict mode
- **THEN** the per-operation diagnostic entries SHALL be identical to what a real apply with the same operations would produce
