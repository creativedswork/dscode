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

### Requirement: Hop-step cluster cascade
The animation SHALL render a six-letter "dscode" cluster that cascades row-by-row through visible `[data-collider]` DOM elements with hop-step game physics including squash/stretch impact deformation, dwell pauses, and viewport-constrained arc hopping.

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

---

### Requirement: DOM destruction effects matrix
The TransitionCanvas SHALL apply distinct visual destruction effects to struck `[data-collider]` elements based on their type, with layout freeze applied before any DOM mutation.

#### Scenario: text-line destruction
- **WHEN** cluster strikes a `data-collider="text-line"` element
- **THEN** `destroyTextLine()` SHALL replace innerHTML with individual `<span>` elements per character
- **AND** each character span SHALL animate via CSS keyframes with random scatter offset (±60px) and 150ms opacity fade
- **AND** if text length > 80 characters, 30–50 particles SHALL spawn at the element position

#### Scenario: code-line destruction
- **WHEN** cluster strikes a `data-collider="code-line"` element
- **THEN** `destroyCodeLine()` SHALL progressively replace characters with ▓ (block) glyphs over multiple frames
- **AND** the element SHALL shake via CSS animation
- **AND** the element SHALL fade to opacity 0 over 400ms
- **AND** no particles SHALL be spawned

#### Scenario: tool-header destruction
- **WHEN** cluster strikes a `data-collider="tool-header"` element
- **THEN** `destroyToolHeader()` SHALL replace innerHTML with scatter-animated span elements per character
- **AND** scatter offset SHALL be ±50px
- **AND** no particles SHALL be spawned

#### Scenario: tool-result-line destruction
- **WHEN** cluster strikes a `data-collider="tool-result-line"` element
- **THEN** `destroyToolResultLine()` SHALL scatter characters with ±40px offset (more subtle than tool-header)
- **AND** if text length > 80 characters, particles SHALL spawn

#### Scenario: tool-card destruction
- **WHEN** cluster strikes a `data-collider="tool-card"` element
- **THEN** `destroyToolCard()` SHALL apply clip-path circle animation collapsing to 0
- **AND** 40–70 particles SHALL spawn from the card position

#### Scenario: message-card destruction
- **WHEN** cluster strikes a `data-collider="message-card"` element
- **THEN** `destroyMessageCard()` SHALL apply a brief white flash (backgroundColor to white, then transition)
- **AND** 4–6 polygon shards SHALL spawn from card center
- **AND** the card's opacity SHALL NOT be changed

#### Scenario: Layout freeze before destruction
- **WHEN** `strikeRow()` processes a row
- **THEN** the element's height SHALL be locked to its pre-strike `getBoundingClientRect().height` via `el.style.height`
- **AND** `box-sizing: border-box` SHALL be set
- **AND** margins (top/bottom), padding (top/bottom), and lineHeight SHALL be frozen to current computed values
- **AND** if the element is `display: inline`, it SHALL be set to `display: inline-block`
- **AND** THEN `destroyByType()` SHALL be called

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
The TransitionCanvas SHALL lock ChatView scrolling for the duration of the animation using both a CSS class and programmatic overflow control.

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

---

### Requirement: ESC key skip
Pressing the Escape key during cascade phase SHALL immediately transition to gather phase, skipping remaining rows.

#### Scenario: ESC in cascade
- **WHEN** the user presses Escape during cascade phase
- **THEN** `startGather()` SHALL be called immediately
- **AND** unstruck rows SHALL remain untouched (no destruction effects)
- **AND** the animation proceeds through gather → formed → onComplete normally

#### Scenario: ESC in gather or formed
- **WHEN** the user presses Escape during gather or formed phase
- **THEN** no action SHALL be taken (ESC only affects cascade)

---

### Requirement: Reduced motion bypass
When the user's system has `prefers-reduced-motion: reduce`, the animation SHALL be skipped entirely.

#### Scenario: Reduced motion detected
- **WHEN** `window.matchMedia("(prefers-reduced-motion: reduce)").matches` is true
- **THEN** `onComplete()` SHALL be called immediately on TransitionCanvas mount
- **AND** `handleTransitionComplete` SHALL set `viewMode` to `"dashboard"` without playing the animation

---

### Requirement: Empty chat view handling
When the ChatView contains no `[data-collider]` elements, the animation SHALL gracefully skip cascade and proceed to gather.

#### Scenario: No rows found
- **WHEN** `buildRowList()` returns an empty array
- **THEN** `updateCascade()` SHALL call `startGather()` after a 2-second timeout
- **AND** the cluster SHALL NOT be rendered

---

### Requirement: Mouse cursor hidden during animation
The cursor SHALL be hidden for the duration of the animation.

#### Scenario: Cursor hidden
- **WHEN** TransitionCanvas mounts and animation starts
- **THEN** `document.body.style.cursor` SHALL be set to `"none"`
- **AND** on cleanup, the cursor SHALL be restored to its previous value

---

### Requirement: Warm theme color integration
Animation colors SHALL be derived from CSS custom properties on the document root at animation start.

#### Scenario: Color extraction
- **WHEN** the animation initializes
- **THEN** `--color-accent`, `--color-text`, and `--color-text-muted` SHALL be read from `getComputedStyle(document.documentElement)`
- **AND** warmPurple SHALL be derived as `hsl(accentHue + 55, 55%, 52%)`

#### Scenario: Letter color mapping
- **WHEN** the cluster is rendered
- **THEN** letters SHALL use the mapping: d→accent, s→warmPurple, c→warmYellow, o→text, d→accent, e→teal
