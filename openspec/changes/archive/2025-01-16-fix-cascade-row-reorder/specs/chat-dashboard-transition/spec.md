## MODIFIED Requirements

### Requirement: Hop-step cluster cascade
The animation SHALL render a six-letter "dscode" cluster that cascades row-by-row through visible `[data-collider]` DOM elements with hop-step game physics including squash/stretch impact deformation, dwell pauses, and viewport-constrained arc hopping. After each strike and recalibration, `rows[]` SHALL be re-sorted by live `top` to maintain correct visual cascade order.

#### Scenario: Rows re-sorted after recalibration
- **WHEN** `strikeRow()` completes DOM mutation and recalibrates unstruck row positions
- **THEN** `s.rows` SHALL be re-sorted by `top` ascending
- **AND** `c.rowIndex` SHALL be set to the struck row's new index in the sorted array
- **AND** subsequent `launchHop()` calls SHALL target the visually correct next unstruck row

#### Scenario: Cluster initialization
- **WHEN** cascade phase begins
- **THEN** six letters ("d", "s", "c", "o", "d", "e") are initialized as a single-row cluster with offsets `[-40, -24, -8, +8, +24, +40]` from cluster center
- **AND** the cluster position is `(W/2, -random(60, 140))` — above the viewport top

#### Scenario: Hop-step state machine
- **WHEN** cluster reaches a target row's Y coordinate (drop complete)
- **THEN** it enters squash state (80ms, scaleY: 1.0→0.6, scaleX: 1.0→1.3)
- **AND** then stretch state (60ms, scaleY: 0.6→1.2, scaleX: 1.3→0.85)
- **AND** then dwell state (300ms, scale breath ±0.02)
- **AND** then hopping state to next row (duration = √gap × 25ms, range 350–800ms)

#### Scenario: Hop arc viewport constraint
- **WHEN** cluster is hopping between two rows near the viewport top
- **THEN** the hop arc peak height SHALL be constrained to `min(rawPeak, max(0, midY))`
- **AND** the cluster SHALL remain visible within the viewport (c.y ≥ 0 at peak)

#### Scenario: Landing X within row bounds
- **WHEN** cluster prepares to hop to a row with width ≥ 70px
- **THEN** landing X SHALL be random within `[row.left + 40, row.left + row.width - 40]`
- **AND** if row width < 70px, landing X SHALL be the row midpoint

#### Scenario: Consecutive landing X constraint
- **WHEN** the difference between current landing X and previous landing X is less than 21px
- **THEN** a new random landing X SHALL be generated (up to 5 attempts)

#### Scenario: Cascade completes when all rows struck
- **WHEN** every row in the `rows[]` array has `struck === true`
- **THEN** the cluster SHALL stop hopping
- **AND** the animation transitions to gather phase
