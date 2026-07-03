## ADDED Requirements

### Requirement: Three-phase animation state machine
The TransitionCanvas SHALL implement a three-phase animation state machine: cascade (cluster hops through rows, striking DOM elements), gather (particles converge to wordmark target points), and formed (particles hold position, water-ripple micro-motion while waiting for dashboard artifact).

#### Scenario: Cascade phase starts on mount
- **WHEN** `transitionPhase` is set to `"animating"` and TransitionCanvas mounts
- **THEN** the animation enters cascade phase
- **AND** the hop-step cluster appears above the viewport top and begins its first drop
- **AND** the HUD label displays "CASCADE"

#### Scenario: Transition from cascade to gather
- **WHEN** all rows in the cascade row list have `struck === true`
- **THEN** the animation transitions to gather phase
- **AND** `startGather()` is called, spawning filler particles from below viewport
- **AND** the HUD label displays "GATHER"

#### Scenario: Transition from gather to formed
- **WHEN** all particles have `phase === "formed"` (distance < 4px from target)
- **THEN** the animation transitions to formed phase
- **AND** `formedTime` begins counting
- **AND** the HUD label displays "FORMED"

#### Scenario: Formed phase completes
- **WHEN** `artifactReadyRef.current === true` AND `formedTime > 600ms`
- **THEN** `onComplete()` is called exactly once
- **AND** the animation loop stops

#### Scenario: Gather safety timeout
- **WHEN** gather phase has run for more than 5 seconds
- **THEN** the animation forcefully enters formed phase regardless of particle positions

#### Scenario: Formed safety timeout
- **WHEN** formed phase has run for more than 5 seconds
- **THEN** `onComplete()` is called regardless of artifact readiness

---

### Requirement: ToolCard collider coverage
Every ToolCard rendered in the chat SHALL expose three levels of `data-collider` attributes so the cascade animation can fully destroy each card: the card wrapper (`tool-card`), the header line (`tool-header`), and each result content line (`tool-result-line`).

#### Scenario: ToolCard outer wrapper has tool-card collider
- **WHEN** a ToolCard is rendered for a tool call result
- **THEN** the outermost `<div>` of the ToolCard SHALL have `data-collider="tool-card"`

#### Scenario: Tool result lines have tool-result-line collider
- **WHEN** a ToolCard renders tool result text with more than 0 characters
- **THEN** the result text SHALL be split by newline (`\n`)
- **AND** each non-empty line SHALL be wrapped in a `<span data-collider="tool-result-line">`
- **AND** empty lines SHALL be rendered as `<br />` inside a `<span data-collider="tool-result-line">`

#### Scenario: ToolCard parent cleanup triggers tool-card destruction
- **WHEN** all child colliders (tool-header + tool-result-line) inside a tool-card have been struck
- **THEN** `destroyToolCard()` SHALL be called on the tool-card wrapper
- **AND** the card SHALL animate via clip-path circle collapse and particle burst

---

### Requirement: Hop-step cluster cascade
The animation SHALL render a six-letter "dscode" cluster that cascades row-by-row through visible `[data-collider]` DOM elements with hop-step game physics including squash/stretch impact deformation, dwell pauses, and viewport-constrained arc hopping. After each strike and recalibration, `rows[]` SHALL be re-sorted by live `top` to maintain correct visual cascade order. Visibility filtering in both `buildRowList()` and `launchHop()` SHALL use the same criteria.

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

#### Scenario: Rows re-sorted after recalibration
- **WHEN** `strikeRow()` completes and recalibrates row positions
- **THEN** `s.rows` SHALL be re-sorted by `top` ascending
- **AND** `c.rowIndex` SHALL be set to the struck row's new index in the sorted array
- **AND** subsequent `launchHop()` calls SHALL target the visually correct next unstruck row

#### Scenario: Consistent visibility filtering between buildRowList and launchHop
- **WHEN** `buildRowList()` filters candidate rows
- **THEN** rows SHALL be excluded only when `top >= H` (entirely below canvas) OR `bottom <= 0` (entirely above canvas)
- **AND** `launchHop()` SHALL apply the same exclusion criteria when finding the next unstruck row
- **AND** partially visible rows (top < 0 but bottom > 0) SHALL be included in the cascade

---

### Requirement: DOM destruction effects matrix
The TransitionCanvas SHALL apply distinct visual destruction effects to struck `[data-collider]` elements based on their type. For text-line, tool-header, tool-result-line, code-line, and table-cell colliders, destruction SHALL use clone+overlay: the element's original DOM children are set to `visibility: hidden` (preserving layout), and a cloned overlay positioned absolutely within the element receives the animated destruction effect. The original element's box model SHALL NOT be affected, and no layout reflow SHALL occur in sibling or ancestor elements.

#### Scenario: text-line destruction
- **WHEN** cluster strikes a `data-collider="text-line"` element
- **THEN** the element's immediate children SHALL be set to `visibility: hidden`
- **AND** a clone overlay SHALL be appended with `position: absolute; top: 0; left: 0; pointer-events: none`
- **AND** the clone SHALL be populated with individual `<span>` elements per text character
- **AND** each character span SHALL animate via CSS keyframes with random scatter offset (±60px) and 450ms total duration
- **AND** after 450ms, the original element SHALL fade to `opacity: 0` and the clone and injected `<style>` SHALL be removed
- **AND** if text length > 80 characters, 30–50 particles SHALL spawn at the element position instead of clone+overlay
- **AND** the element's box model (height, width, margins, padding) SHALL NOT change during or after destruction

#### Scenario: code-line destruction
- **WHEN** cluster strikes a `data-collider="code-line"` element
- **THEN** a clone overlay SHALL be appended (same positioning as text-line)
- **AND** the clone SHALL progressively replace characters with ▓ (block) glyphs over multiple frames
- **AND** the clone SHALL shake via CSS animation
- **AND** the clone SHALL fade to opacity 0 over 400ms
- **AND** after 400ms, the original element SHALL fade to `opacity: 0` and the clone SHALL be removed
- **AND** no particles SHALL be spawned

#### Scenario: tool-header destruction
- **WHEN** cluster strikes a `data-collider="tool-header"` element
- **THEN** a clone overlay SHALL be appended with scatter-animated span elements per character
- **AND** scatter offset SHALL be ±50px
- **AND** after 380ms, the original element SHALL fade to `opacity: 0` and the clone SHALL be removed
- **AND** no particles SHALL be spawned

#### Scenario: tool-result-line destruction
- **WHEN** cluster strikes a `data-collider="tool-result-line"` element
- **THEN** a clone overlay SHALL be appended with scatter-animated span elements per character
- **AND** scatter offset SHALL be ±40px
- **AND** after 330ms, the original element SHALL fade to `opacity: 0` and the clone SHALL be removed
- **AND** if text length > 100 characters, particles SHALL spawn instead of clone+overlay

#### Scenario: tool-card destruction
- **WHEN** cluster strikes a `data-collider="tool-card"` element (via parent cleanup after all children struck)
- **THEN** `destroyToolCard()` SHALL apply clip-path circle animation collapsing from impact point to 0 over 350ms
- **AND** 40–70 particles SHALL spawn from the card position
- **AND** the card SHALL fade to opacity 0 starting at 250ms

#### Scenario: message-card destruction (direct strike)
- **WHEN** cluster strikes a `data-collider="message-card"` element directly (not via parent cleanup, i.e. message-card is a leaf row)
- **THEN** `destroyMessageCard()` SHALL apply a brief white flash (backgroundColor to white, then transition to transparent over 80ms)
- **AND** 4–6 polygon shards SHALL spawn from card center
- **AND** the card's opacity SHALL NOT be changed (child colliders still need to be individually struck)

#### Scenario: message-card destruction (recursive parent cleanup)
- **WHEN** all child colliders inside a message-card and all nested containers have been struck
- **THEN** the recursive parent cleanup SHALL reach the message-card
- **AND** the message-card SHALL fade to `opacity: 0` with `transition: opacity 200ms ease-out`
- **AND** particles SHALL spawn from the card position

#### Scenario: recursive parent cleanup walks full ancestor chain
- **WHEN** a collider row is struck
- **THEN** after destruction, the cleanup logic SHALL walk up the DOM tree collecting all `[data-collider="tool-card"]` and `[data-collider="message-card"]` ancestors
- **AND** for each ancestor, from innermost to outermost, SHALL check whether all of its `[data-collider]` descendants have been struck
- **AND** if all descendants are struck, the ancestor SHALL be cleaned up (particles + opacity 0)
- **AND** if any descendant is not yet struck, the walk SHALL stop (no further ancestor cleanup)

#### Scenario: table-cell destruction
- **WHEN** cluster strikes a `data-collider="table-cell"` element
- **THEN** destruction SHALL use the same clone+overlay approach as text-line
- **AND** scatter offset SHALL be ±60px

#### Scenario: Empty text-line skipped
- **WHEN** cluster strikes a `data-collider="text-line"` element whose `textContent` is empty (only `<br/>`)
- **THEN** no clone SHALL be created
- **AND** no scatter animation SHALL run
- **AND** the element SHALL immediately be set to `opacity: 0`

---

### Requirement: Layout stability during destruction
The destruction of any `[data-collider]` element SHALL NOT cause layout reflow in sibling or ancestor elements. For text-like colliders (text-line, tool-header, tool-result-line, code-line, table-cell), this is achieved by clone+overlay animation with the original DOM structure preserved. For card colliders (tool-card, message-card), destruction effects SHALL use CSS properties that do not affect box-model dimensions (clip-path, background-color, opacity).

#### Scenario: No layout reflow from text-line destruction
- **WHEN** a text-line is struck and its clone+overlay animation begins
- **THEN** `getBoundingClientRect()` of all sibling elements SHALL return unchanged values (within 1px tolerance)
- **AND** the scroll position of any ancestor scroll container SHALL NOT change

#### Scenario: No layout reflow from tool-result-line destruction inside scrollable container
- **WHEN** a tool-result-line inside a `max-h-40 overflow-y-auto` container is struck
- **THEN** the container's `scrollTop` SHALL NOT change
- **AND** the container's `scrollHeight` SHALL NOT change

#### Scenario: No display type mutation
- **WHEN** `strikeRow()` processes any text-like collider
- **THEN** the element's `display` CSS property SHALL NOT be modified
- **AND** the element's `height`, `margin`, `padding`, `lineHeight` SHALL NOT be explicitly set
- **AND** no `compensateDy`/`compensateDx` calculation SHALL be performed

---

### Requirement: Particle system physics
The animation SHALL maintain a particle system with ≤ 2500 particles, each following phase-specific physics: fall (gravity + friction), gather (gravitational attraction to target), and formed (hold position with optional water-ripple offset).

#### Scenario: Fall phase physics
- **WHEN** a particle is in `fall` phase during cascade
- **THEN** vertical velocity SHALL increase by `0.28 × dtFactor` per frame
- **AND** horizontal velocity SHALL be damped by `× 0.995` per frame
- **AND** particles with `y > H` SHALL be removed from the array

#### Scenario: Gather phase physics
- **WHEN** a particle is in `gather` phase
- **THEN** it SHALL accelerate toward its target point with force `0.55` (vx += dx/dist × 0.55, vy += dy/dist × 0.55)
- **AND** velocity SHALL be damped by `× 0.88` per frame
- **AND** when `distance < 4px` from target, it SHALL snap to target, set `phase = "formed"`, `flash = 1`

#### Scenario: Formed phase physics
- **WHEN** a particle is in `formed` phase
- **THEN** flash SHALL decay by `× 0.92` per frame
- **AND** if `artifactReadyRef.current === false`, the particle SHALL offset by `sin(time × 0.003 + index × 0.7) × 2.5px`

#### Scenario: Particle cap enforcement
- **WHEN** the particle array exceeds 2500
- **THEN** no new particles SHALL be spawned until the count drops below the cap

#### Scenario: Target point generation
- **WHEN** gather phase initializes
- **THEN** "DSCode" SHALL be rendered to an offscreen canvas at 700px font weight Geist
- **AND** target points SHALL be sampled from opaque pixels on a 6px grid
- **AND** points SHALL be shuffled and capped at 2500

---

### Requirement: Render pipeline
The TransitionCanvas SHALL render each frame in a fixed draw order: clear, shake transform, formed glow, cluster, particles, impact rings, shards, HUD.

#### Scenario: Frame draw order
- **WHEN** a frame is rendered
- **THEN** operations SHALL execute in order: (1) clearRect, (2) save context, (3) apply shake translate if shake > 0, (4) drawFormedGlow if in formed phase, (5) drawCluster if in cascade phase, (6) drawParticles, (7) drawRings, (8) drawShards, (9) restore context, (10) drawHUD

#### Scenario: Canvas sizing
- **WHEN** TransitionCanvas initializes
- **THEN** the Canvas backing store SHALL use `Math.min(devicePixelRatio, 2)` as DPR
- **AND** logical dimensions SHALL match the parent container's `clientWidth` and `clientHeight`
- **AND** if dimensions are 0×0, the first frame SHALL recursively requestAnimationFrame until container is ready

#### Scenario: Frame clearing
- **WHEN** each frame begins
- **THEN** `ctx.clearRect(0, 0, W, H)` SHALL be called
- **AND** no background fill or trail alpha SHALL be applied (transparent overlay)

---

### Requirement: Scroll locking during animation
The TransitionCanvas SHALL lock ChatView scrolling for the duration of the animation using both a CSS class and programmatic overflow control. Off-screen content SHALL NOT be modified or hidden during the animation.

#### Scenario: CSS scroll lock
- **WHEN** `transitionPhase` is `"animating"`
- **THEN** ChatView SHALL receive the `scrollLocked` prop
- **AND** ChatView SHALL apply `overflow: hidden` and `pointer-events: none` CSS

#### Scenario: Programmatic scroll lock
- **WHEN** TransitionCanvas initializes animation
- **THEN** it SHALL save the scroll container's current `scrollTop`
- **AND** set `scrollContainer.style.overflow = "hidden"`
- **AND** on cleanup, restore `scrollTop` and `overflow` to saved values

#### Scenario: Scroll container resolution
- **WHEN** `scrollContainerRef.current` is null
- **THEN** TransitionCanvas SHALL fall back to ancestor traversal to find the nearest scrollable element

#### Scenario: Off-screen content left untouched
- **WHEN** content exists above or below the visible canvas area during animation
- **THEN** no `hideOffscreenColliders()` SHALL be called
- **AND** no `opacity: 0` SHALL be applied to off-screen colliders
- **AND** the content SHALL be naturally hidden by the scroll lock until scroll position is restored on cleanup

---

### Requirement: ESC key skip
Pressing the Escape key during cascade phase SHALL immediately transition to gather phase, skipping remaining rows.

#### Scenario: ESC in cascade
- **WHEN** the user presses Escape during cascade phase
- **THEN** `startGather()` SHALL be called immediately
- **AND** unstruck rows SHALL remain untouched (no destruction effects)
- **AND** the animation proceeds through gather → formed → onComplete normally

---

### Requirement: Formed phase ripple
During formed phase, the DSCode wordmark SHALL render anchored particles with continuous water-ripple micro-motion while awaiting the dashboard artifact.

#### Scenario: Ripple at formed entry
- **WHEN** formed phase begins
- **THEN** all particles are anchored at their target (x, y) positions
- **AND** each particle's `flash` decay SHALL start from 1.0

#### Scenario: Ripple micro-motion
- **WHEN** formed phase continues and `artifactReadyRef.current === false`
- **THEN** each particle SHALL offset from its anchor by `sin(y*0.04 + t*0.002) * cos(x*0.03 + t*0.0015) * 2.5`
- **AND** the offset SHALL create a continuous, organic ripple effect across the wordmark

---

### Requirement: Gathered particles reuse
Filler particles spawned during gather phase SHALL distribute by letter distribution proportional to target pixel count.

#### Scenario: Letter distribution
- **WHEN** `startGather()` is called
- **THEN** target point P SHALL be assigned a letter from its pixel position in the offscreen canvas text rendering
- **AND** filler particles SHALL each be assigned to a letter via round-robin from the full set of target letters
