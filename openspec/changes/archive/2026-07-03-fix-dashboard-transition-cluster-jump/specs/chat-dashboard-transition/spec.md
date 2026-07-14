## ADDED Requirements

### Requirement: Struck row recalibration uses pre-mutation snapshot
After `strikeRow()` applies layout freeze and calls `destroyByType()`, the recalibration step SHALL use the struck row's pre-mutation `top` snapshot for syncing `cluster.y`, rather than calling `getBoundingClientRect()` on the mutated element. Unstruck rows SHALL continue to use live `getBoundingClientRect()` measurements.

#### Scenario: Snapshot captured before layout freeze
- **WHEN** `strikeRow()` begins processing a row
- **THEN** the row's current `getBoundingClientRect().top` (relative to canvas) SHALL be saved as `snapshotTop`
- **AND** layout freeze (display, height, margins, padding, lineHeight) SHALL then be applied

#### Scenario: Cluster Y sync uses snapshot after mutation
- **WHEN** recalibration runs after `destroyByType()` and layout freeze
- **THEN** the struck row's `top` SHALL be set to `snapshotTop`
- **AND** `cluster.y` SHALL be set to `snapshotTop`
- **AND** unstruck row positions SHALL be re-measured via live `getBoundingClientRect()`
