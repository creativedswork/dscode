## MODIFIED Requirements

### Requirement: Hop-step cluster cascade

The animation SHALL render a six-letter "dscode" cluster that cascades row-by-row through ALL leaf `[data-collider]` DOM elements in the chat scroll container, across the full scroll height (not only the currently-visible viewport), using hop-step game physics with squash/stretch impact deformation and dwell pauses. The cluster SHALL automatically scroll the container so descending rows stay in view. Landing coordinates SHALL target the tight text-content bounds of each row. After each strike and recalibration, `rows[]` SHALL be re-sorted by content-space `top` to maintain correct visual cascade order.

#### Scenario: Cluster initialization
- **WHEN** cascade phase begins
- **THEN** six letters ("d", "s", "c", "o", "d", "e") are initialized as a single-row cluster with offsets `[-40, -24, -8, +8, +24, +40]` from cluster center
- **AND** the cluster position is `(W/2, -random(60, 140))` in content-space, above the first row

#### Scenario: Hop-step state machine
- **WHEN** cluster reaches a target row's Y coordinate (drop complete)
- **THEN** it enters squash state (80ms, scaleY 1.0→0.6, scaleX 1.0→1.3)
- **AND** then stretch state (60ms, scaleY 0.6→1.2, scaleX 1.3→0.85)
- **AND** then dwell state (300ms, scale breath ±0.02)
- **AND** then hopping state to next row (duration = √gap × 25ms, range 350–800ms)

#### Scenario: Full-content row collection
- **WHEN** `buildRowList()` collects candidate rows
- **THEN** it SHALL include every leaf `[data-collider]` element across the full scroll height
- **AND** rows SHALL be positioned in content-space coordinates (`top = rect.top - scrollRect.top + scrollTop`)
- **AND** rows SHALL NOT be excluded for being outside the current canvas viewport

#### Scenario: Auto-scroll keeps cluster in view
- **WHEN** the cluster descends toward rows below the viewport bottom
- **THEN** the chat scroll container SHALL be scrolled programmatically so the cluster remains visible near a fixed viewport fraction
- **AND** user scrolling SHALL be locked during the cascade (`overflow: hidden`)

#### Scenario: Landing on text content bounds
- **WHEN** the cluster prepares to hop to a row
- **THEN** landing X SHALL be the horizontal center of the row's tight text-content bounds
- **AND** landing Y SHALL be the vertical center of the row's tight text-content bounds
- **AND** tight bounds SHALL be derived from `Range.getClientRects()` over the element's text content, falling back to the element box when unavailable

#### Scenario: Next-row selection across full list
- **WHEN** `selectNextCascadeRowIndex()` finds the next unstruck row
- **THEN** it SHALL return the topmost unstruck row in the full `rows[]` list
- **AND** it SHALL NOT filter candidates by canvas height (`top < canvasHeight`)
- **AND** it SHALL return `-1` only when no unstruck rows remain

#### Scenario: Cascade completes when all rows struck
- **WHEN** every row in the `rows[]` array has `struck === true`
- **THEN** the cluster SHALL stop hopping
- **AND** the animation transitions to gather phase

#### Scenario: Rows re-sorted after recalibration
- **WHEN** `strikeRow()` completes and recalibrates row positions
- **THEN** `s.rows` SHALL be re-sorted by content-space `top` ascending
- **AND** `c.rowIndex` SHALL be set to the struck row's new index in the sorted array
- **AND** subsequent `launchHop()` calls SHALL target the visually correct next unstruck row

## ADDED Requirements

### Requirement: Lively impact feedback

When the cluster strikes a text-like collider, the animation SHALL render layered impact feedback: an accent impact ring, a brief screen shake, a denser radial particle burst, and per-character scatter of the struck line's text. Text longer than 80 characters SHALL use a particle burst instead of per-character scatter to bound DOM node churn.

#### Scenario: Impact ring on strike
- **WHEN** the cluster strikes a row
- **THEN** an accent-colored ring SHALL spawn at the strike point
- **AND** the ring SHALL expand outward and fade over its lifetime

#### Scenario: Screen shake on strike
- **WHEN** the cluster strikes a row
- **THEN** the canvas SHALL translate by a small random shake offset
- **AND** the shake SHALL decay toward zero over subsequent frames

#### Scenario: Radial particle burst on strike
- **WHEN** the cluster strikes a row
- **THEN** 34–80 particles SHALL spawn from the row's text-content center
- **AND** particles SHALL emit with radial velocities and gravity

#### Scenario: Per-character scatter of struck text
- **WHEN** the cluster strikes a text-like collider whose text length is ≤ 80 characters
- **THEN** the line's text SHALL be split into individual characters
- **AND** each character SHALL animate outward with independent translate/rotate/scale in screen space
- **AND** the original element SHALL fade without changing its box model

#### Scenario: Long text falls back to particle burst
- **WHEN** the cluster strikes a text-like collider whose text length is > 80 characters
- **THEN** per-character scatter SHALL be skipped
- **AND** a particle burst SHALL be used instead
