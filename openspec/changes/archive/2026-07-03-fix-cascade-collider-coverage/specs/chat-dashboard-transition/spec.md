## ADDED Requirements

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

## MODIFIED Requirements

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

#### Scenario: message-card destruction
- **WHEN** cluster strikes a `data-collider="message-card"` element (via parent cleanup after all children struck)
- **THEN** `destroyMessageCard()` SHALL apply a brief white flash (backgroundColor to white, then transition to transparent over 80ms)
- **AND** 4–6 polygon shards SHALL spawn from card center
- **AND** the card's opacity SHALL NOT be changed

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

### Requirement: Hop-step cluster cascade
The animation SHALL render a six-letter "dscode" cluster that cascades row-by-row through visible `[data-collider]` DOM elements with hop-step game physics including squash/stretch impact deformation, dwell pauses, and viewport-constrained arc hopping. After each strike, `rows[]` SHALL be re-sorted by live `top` to maintain correct visual cascade order. Visibility filtering in both `buildRowList()` and `launchHop()` SHALL use the same criteria.

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
- **WHEN** `strikeRow()` completes and recalibrates unstruck row positions
- **THEN** `s.rows` SHALL be re-sorted by `top` ascending
- **AND** `c.rowIndex` SHALL be set to the struck row's new index in the sorted array
- **AND** subsequent `launchHop()` calls SHALL target the visually correct next unstruck row

#### Scenario: Consistent visibility filtering between buildRowList and launchHop
- **WHEN** `buildRowList()` filters candidate rows
- **THEN** rows SHALL be excluded only when `top >= H` (entirely below canvas) OR `bottom <= 0` (entirely above canvas)
- **AND** `launchHop()` SHALL apply the same exclusion criteria when finding the next unstruck row
- **AND** partially visible rows (top < 0 but bottom > 0) SHALL be included in the cascade

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

## REMOVED Requirements

### Requirement: Layout freeze before destruction
**Reason**: With the clone+overlay approach for text-like colliders, the original DOM is never mutated — only `visibility: hidden` is set on children. Layout freeze (height lock, display switch, margin/padding/lineHeight freeze) is no longer needed and is removed to eliminate ~40 lines of compensation code.

**Migration**: Delete the layout freeze block in `strikeRow()` (height lock, box-sizing, margin/padding/lineHeight freeze, inline→inline-block switch, compensateDy/Dx calculation, innerScrollTop snapshot/restore). The `destroyByType()` call remains; it now internally uses clone+overlay for text-like colliders.
