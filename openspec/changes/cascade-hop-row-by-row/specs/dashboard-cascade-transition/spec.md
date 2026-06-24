## ADDED Requirements

### Requirement: Content-only row list extraction
The cascade animation SHALL extract collision rows exclusively from visible, content-bearing leaf DOM elements. Parent-level wrapper colliders, empty elements, and scroll-hidden elements SHALL be excluded. Text-like colliders SHALL use content-tight width measured via Canvas `measureText`.

#### Scenario: Parent-level colliders are excluded
- **WHEN** `buildRowList()` scans the DOM for `[data-collider]` elements
- **AND** an element's nearest `[data-collider]` ancestor via `closest('[data-collider]')` is not the element itself
- **THEN** that element SHALL be skipped (it is a child of another collider)

#### Scenario: Empty colliders of all types are filtered
- **WHEN** `buildRowList()` evaluates a `[data-collider]` element
- **AND** `el.textContent?.trim()` returns falsy
- **THEN** that element SHALL be excluded regardless of its `data-collider` type

#### Scenario: Scroll-hidden elements are excluded
- **WHEN** `buildRowList()` evaluates a `[data-collider]` element
- **AND** walking up the DOM reveals an ancestor with computed `overflow-y: auto` or `overflow-y: scroll`
- **AND** the element's `getBoundingClientRect()` is entirely outside that ancestor's clip region
- **THEN** the element SHALL be excluded

#### Scenario: Content-tight width for text-like colliders
- **WHEN** `buildRowList()` processes a collider of type text-line, code-line, or tool-result-line
- **THEN** the row's `width` SHALL be set to `Math.min(elementRect.width, measureText(el.textContent).width + 4)`
- **AND** the font for `measureText` SHALL match the element's computed style (font-weight, font-size, font-family)

#### Scenario: Random landing X with consecutive-row variation
- **WHEN** `buildRowList()` assigns `landingX` to each row
- **THEN** `landingX` SHALL be randomly chosen within `[row.left + row.width * 0.15, row.left + row.width * 0.85]`
- **AND** if consecutive rows have `abs(landingX_i - landingX_{i-1}) < CLUSTER_WIDTH * 0.3`, a new X SHALL be re-rolled up to 5 times

### Requirement: Hop-step cluster entity
The cascade phase SHALL use a single unified "dscode" cluster entity that hops row-by-row through the content rows. The cluster SHALL be rendered as 4 letters (d, s, c, o) in a compact 2×2 arrangement with fixed letter size (22px). The cluster SHALL always remain horizontal — no rotation.

#### Scenario: Cluster is a single entity
- **WHEN** the cascade phase starts
- **THEN** a single `ClusterState` SHALL be created with initial position centered horizontally and 60-140px above the canvas top edge
- **AND** `rowIndex` SHALL start at -1 (above all rows)
- **AND** `hopState` SHALL be "drop"

#### Scenario: Cluster renders as 2×2 letter arrangement
- **WHEN** the cluster is drawn each frame
- **THEN** four letters (d, s, c, o) SHALL be rendered at offsets from the cluster center: d at (-10,-8), s at (+4,-8), c at (-8,+6), o at (+6,+6)
- **AND** per-frame random jitter of ±2px SHALL be applied to each letter's offset
- **AND** letter size SHALL be fixed at 22px

#### Scenario: No rotation
- **WHEN** the cluster is rendered
- **THEN** no `ctx.rotate()` SHALL be applied to the cluster
- **AND** the cluster SHALL maintain zero rotation throughout the entire cascade phase

### Requirement: Hop-state machine with dwell
The cluster SHALL progress through a 5-state hop cycle: drop → squash → stretch → dwell → hopping (repeat). Each state SHALL have a fixed duration, driven by `hopTimer`.

#### Scenario: Drop state
- **WHEN** `hopState` is "drop"
- **THEN** the cluster SHALL descend from above-screen at constant velocity to the first row's Y position
- **AND** upon reaching the row, `hopState` SHALL transition to "squash" with `hopTimer` set to 80ms

#### Scenario: Squash state with destruction
- **WHEN** `hopState` is "squash" and `hopTimer` is 80ms (frame 0 of squash)
- **THEN** `destroyByType()` SHALL be called on the current row's element
- **AND** impact fragments SHALL spawn at the cluster's position
- **AND** the cluster's `scaleY` SHALL lerp from 1.0 to 0.6 and `scaleX` from 1.0 to 1.3 over the 80ms duration

#### Scenario: Stretch state
- **WHEN** `hopState` transitions from "squash" to "stretch"
- **THEN** `hopTimer` SHALL be set to 60ms
- **AND** `scaleY` SHALL lerp from 0.6 to 1.2 and `scaleX` from 1.3 to 0.85 over the 60ms duration
- **AND** at the end of stretch, scales SHALL snap to 1.0

#### Scenario: Dwell state with breathing animation
- **WHEN** `hopState` transitions from "stretch" to "dwell"
- **THEN** `hopTimer` SHALL be set to 300ms
- **AND** the cluster SHALL render at rest on the current row
- **AND** a breathing scale pulse SHALL be applied: `1.0 + sin(breathPhase) * 0.02` where `breathPhase` advances at `2π / 600ms`

#### Scenario: Hopping state via parabolic arc
- **WHEN** `hopState` transitions from "dwell" to "hopping"
- **THEN** the hop SHALL be a pre-computed parabola from current row's landing point to next row's landing point
- **AND** `hopDuration` SHALL be computed as `max(350ms, sqrt(2 * gap / HOP_G))` where `HOP_G = 0.002` and `gap = abs(nextRow.top - currentRow.top)`
- **AND** peak height SHALL be `max(40px, gap * 1.5)`
- **AND** X position SHALL interpolate with `easeOutQuad` from start to end over `hopProgress`
- **AND** upon reaching the next row (`hopProgress >= 1.0`), `rowIndex` SHALL increment and state transition to "squash"

### Requirement: Squash-stretch deformation via Canvas transform
The cluster SHALL deform on impact using Canvas `scale()` with a transform origin centered on the contact foot position.

#### Scenario: Dual-foot contact on wide rows
- **WHEN** the cluster contacts a row where both d-bottom and c-bottom X coordinates fall within `[row.left, row.left + row.width]`
- **THEN** the transform origin SHALL be at the midpoint of d-bottom and c-bottom
- **AND** `ctx.scale(s.scaleX, s.scaleY)` SHALL be applied centered on that origin

#### Scenario: Single-foot contact on narrow rows
- **WHEN** the cluster contacts a row where only d-bottom X is within row bounds
- **THEN** the transform origin SHALL be at d-bottom only
- **AND** the cluster SHALL stay horizontal (no tilt)

### Requirement: Cascade completion and gather transition
The cascade phase SHALL transition to gather when the cluster has visited all rows (rowIndex >= rows.length), or after an 8-second safety timeout.

#### Scenario: Completion after last row
- **WHEN** the cluster's `rowIndex >= s.rows.length` AND `hopState` is "hopping" AND `hopProgress >= 1.0`
- **THEN** `startGather()` SHALL be called immediately

#### Scenario: Safety timeout fallback
- **WHEN** `phaseTime` exceeds 8000ms AND `gatherStarted` is false
- **THEN** `startGather()` SHALL be called regardless of `rowIndex`

#### Scenario: No deadlock possible
- **WHEN** any cascade phase starts
- **THEN** the animation SHALL always reach the gather phase, either via row completion or safety timeout
- **AND** no condition SHALL create an infinite wait for `allRowsStruck`

## MODIFIED Requirements

### Requirement: Four-letter cascade model
The animation SHALL use a single unified "dscode" cluster entity that enters from the top and hops row-by-row through chat content. The cluster SHALL visit every content-bearing leaf collider element in top-to-bottom order via pre-computed parabolic arcs, with squash-stretch deformation on impact and a 300ms dwell pause between hops.

#### Scenario: Cluster enters from above
- **WHEN** the "cascade" phase begins
- **THEN** the "dscode" cluster SHALL enter from 60–140px above the visible area
- **AND** the cluster SHALL descend at constant velocity to the first row in the filtered row list

#### Scenario: Cluster hops row-by-row
- **WHEN** the cluster contacts a row
- **THEN** it SHALL squash (80ms), stretch (60ms), dwell on the row (300ms), then launch to the next row via a parabolic arc
- **AND** each hop SHALL land precisely at the next row's pre-computed `landingX`
- **AND** the arc SHALL have a minimum duration of 350ms and peak height of max(40px, row_gap * 1.5)

#### Scenario: Every row is visited
- **WHEN** the row list has N entries
- **THEN** the cluster SHALL visit each row exactly once in sequential index order
- **AND** after visiting row N-1, the cluster SHALL trigger the gather transition

#### Scenario: Cluster stays horizontal
- **WHEN** the cluster is in any hop state
- **THEN** it SHALL render at rotation = 0
- **AND** horizontal X interpolation SHALL use `easeOutQuad` for natural deceleration into landing

### Requirement: Live DOM collision and opacity transition
When the hop-step cluster contacts a collidable ChatView DOM element, the element SHALL be destroyed via its per-type destruction handler, flash white, and dissolve to opacity 0 with a CSS transition. Particles SHALL spawn at the impact position on the Canvas.

#### Scenario: Collidable elements tagged with data attributes
- **WHEN** ChatView renders message content
- **THEN** each visible text line SHALL be wrapped in an element with `data-collider="text-line"`
- **AND** each code block line SHALL have `data-collider="code-line"`
- **AND** each tool card SHALL have `data-collider="tool-card"`
- **AND** each tool header SHALL have `data-collider="tool-header"`
- **AND** each tool result line SHALL have `data-collider="tool-result-line"`
- **AND** each message card SHALL have `data-collider="message-card"`

#### Scenario: Element contacted by cluster
- **WHEN** the cluster enters the "squash" state at a row
- **THEN** the row's element SHALL receive a white background flash (`rgba(255,255,255,0.85)`) instantly
- **AND** `destroyByType()` SHALL be called with the element and impact position while the element is still fully visible
- **AND** after destruction, the element SHALL transition `opacity` to `"0"` over 180ms with a 60ms delay
- **AND** the element SHALL be physically displaced via `transform: translate(dx, dy)` where dx ∈ [-8,8], dy ∈ [-4,2]

#### Scenario: Unstruck rows remain visible
- **WHEN** the cascade animation is active
- **THEN** ChatView rows that have NOT been struck SHALL remain fully visible with their original styling
- **AND** code highlighting, markdown rendering, and tool card styling SHALL be preserved

#### Scenario: Collision detection via row index
- **WHEN** each animation frame executes
- **THEN** collision SHALL be determined by comparing the cluster's Y position against the current row's `top` field
- **AND** no per-frame DOM query SHALL be needed for collision detection

### Requirement: Particle cascade and convergence
Particles spawned from struck elements SHALL fall under gravity without bouncing. When all rows have been visited, the remaining particles SHALL converge to form the DSCode wordmark.

#### Scenario: Particles spawn on element strike
- **WHEN** an element is struck by the cluster
- **THEN** particles SHALL spawn at the impact position and across the element's bounding rect area with random initial velocities
- **AND** each particle SHALL be assigned a color from the warm palette derived from CSS custom properties
- **AND** all spawned particles SHALL have phase "fall"

#### Scenario: Particles fall downward only
- **WHEN** particles are in the "fall" phase during cascade
- **THEN** they SHALL accelerate downward (`vy += 0.28 * dtFactor`)
- **AND** they SHALL NOT bounce off the bottom boundary
- **AND** particles whose Y exceeds `H + 10` SHALL be removed
- **AND** particles with a `life` field that reaches 0 SHALL be removed

#### Scenario: Gather phase triggers when all rows visited
- **WHEN** `rowIndex >= rows.length` after completing the final hop
- **THEN** the state machine SHALL transition from "cascade" to "gather"
- **AND** target positions SHALL be sampled from "DSCode" rendered on an offscreen Canvas
- **AND** particles SHALL accelerate toward assigned target positions

#### Scenario: Particles converge to DSCode wordmark
- **WHEN** a particle's gather delay has elapsed
- **THEN** it SHALL continuously accelerate toward its target (`force = 0.55`)
- **AND** velocity SHALL be damped (`* 0.88`) for controlled approach
- **AND** on arrival (distance < 4px), particle SHALL snap to target and enter "formed" phase

#### Scenario: Filler particles if insufficient
- **WHEN** particle count is less than target point count
- **THEN** additional particles SHALL spawn from below the visible area, capped at 2500 total

## REMOVED Requirements

### Requirement: Letter physics
**Reason**: Replaced by hop-step cluster physics (see "Hop-state machine with dwell" and "Squash-stretch deformation").
**Migration**: All gravity accumulation, terminal velocity, bounce restitution, and per-letter velocity fields are removed. The cluster uses pre-computed parabolic arcs with no accumulated velocity state.
