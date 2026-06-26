## 1. ChatView: data-collider attributes

- [x] 1.1 Wrap each visible text line in `<span data-collider="text-line">` in Markdown.tsx
- [x] 1.2 Add `data-collider="code-line"` to each code block line in `<pre><code>` blocks
- [x] 1.3 Add `data-collider="tool-card"` to tool card container in ToolCard.tsx
- [x] 1.4 Add `data-collider="tool-header"` to tool name/status header in ToolCard.tsx
- [x] 1.5 Add `data-collider="tool-result-line"` to tool result text lines in ToolCard.tsx
- [x] 1.6 Add `data-collider="message-card"` to user/assistant message bubbles in ChatView.tsx
- [x] 1.7 Ensure all data-collider wrappers are transparent (no additional styling, no layout shift)
- [x] 1.8 Verify ChatView renders identically with data attributes (visual regression check)

## 2. TransitionCanvas: transparent overlay foundation

- [x] 2.1 Create `TransitionCanvas.tsx` shell: `<canvas>` with `background: transparent` and `pointer-events: none`
- [x] 2.2 Implement `clearRect`-based frame clearing (no opaque fill, no trail alpha)
- [x] 2.3 Remove all background-drawing code (radial gradient, scrolling grid, crosshair, background fill)
- [x] 2.4 Remove collider-rectangle drawing code
- [x] 2.5 Read CSS custom properties at init (colors, letter color map)
- [x] 2.6 Implement `prefers-reduced-motion` detection — skip animation, call onComplete immediately
- [x] 2.7 Cap DPR at 2 for Canvas backing store
- [x] 2.8 Clamp dt to 33ms max per frame

## 3. State machine: cascade → gather → formed

- [x] 3.1 Define three-phase state machine: `cascade → gather → formed` with transition conditions
- [x] 3.2 Implement cascade phase: cluster hops through rows, striking DOM elements
- [x] 3.3 Implement gather transition: trigger when all rows struck or ESC pressed
- [x] 3.4 Implement formed phase: breathing glow, wait for dashboard ready + 600ms settle
- [x] 3.5 Add gather safety timeout: 5s → force formed
- [x] 3.6 Add formed safety timeout: 5s → force onComplete
- [x] 3.7 Add phase label HUD overlay: Geist Mono 11px, bottom-right, textMuted

## 4. Hop-step cluster cascade

- [x] 4.1 Six-letter cluster with offsets `[-40, -24, -8, +8, +24, +40]` from cluster center
- [x] 4.2 Implement hop-step state machine: drop → squash (80ms) → stretch (60ms) → dwell (300ms) → hopping
- [x] 4.3 Implement squash/stretch deformation: `ctx.scale(sx, sy)` anchored at impact foot
- [x] 4.4 Implement dwell breathing animation: scale breath ±0.02
- [x] 4.5 Implement hop arc: `c.y = lerp(startY, endY, t) - peakHeight × sin(t·π)`
- [x] 4.6 Enforce viewport constraint: `peakHeight = min(rawPeak, max(0, midY))`
- [x] 4.7 Landing X within row bounds: random in `[left+40, left+width-40]` or row midpoint
- [x] 4.8 Consecutive landing X gap ≥ 21px (re-random up to 5 times)
- [x] 4.9 Cluster initial position: `(W/2, -random(60, 140))` above viewport
- [x] 4.10 `buildRowList()`: query `[data-collider]`, filter to leaf nodes only, skip off-screen elements
- [x] 4.11 `hideOffscreenColliders()`: set viewport-外 elements to `opacity: 0; transition: none`
- [x] 4.12 Empty chat view handling: 2s timeout → startGather

## 5. Live DOM collision and destruction effects

- [x] 5.1 Track struck elements in `struckElements: Set<HTMLElement>`
- [x] 5.2 Per-frame collision query: `querySelectorAll('[data-collider]')` filtered by unstruck set
- [x] 5.3 AABB collision test: cluster foot vs `getBoundingClientRect()` with margin
- [x] 5.4 Implement `destroyByType()` dispatch based on `data-collider` attribute value
- [x] 5.5 `destroyTextLine()`: per-character scatter via CSS keyframes (±60px), particles for >80 chars
- [x] 5.6 `destroyCodeLine()`: progressive ▓ corruption + shake + fade out (400ms)
- [x] 5.7 `destroyToolHeader()`: per-character scatter (±50px)
- [x] 5.8 `destroyToolResultLine()`: subtle per-character scatter (±40px), particles for long text
- [x] 5.9 `destroyToolCard()`: clip-path circle collapse + 40–70 particle burst
- [x] 5.10 `destroyMessageCard()`: white flash + 4–6 polygon shards (no opacity change)
- [x] 5.11 Parent container cleanup: cascade destroy when all children struck

## 6. Layout freeze and position recalibration

- [x] 6.1 `strikeRow()`: freeze element height via `el.style.height = row.height + "px"`
- [x] 6.2 Set `box-sizing: border-box` on struck element
- [x] 6.3 Freeze margins (top/bottom), padding (top/bottom), lineHeight
- [x] 6.4 Convert `display: inline` to `display: inline-block` for height lock compatibility
- [x] 6.5 Re-measure struck row position after DOM mutation, update `row.top` and cluster `c.y`
- [x] 6.6 Re-measure all unstruck rows' `getBoundingClientRect()` to update position snapshots
- [x] 6.7 Sync `hopEndY`/`hopEndX` if cluster is mid-hop during recalibration
- [x] 6.8 No `overflow: hidden` — allow scatter transforms to render outside bounds

## 7. Particle system

- [x] 7.1 Define `Particle` interface: x, y, vx, vy, size, color, phase, tx, ty, gatherDelay, flash, life
- [x] 7.2 Implement fall phase physics: vy += 0.28·dtFactor, vx *= 0.995, remove on y > H
- [x] 7.3 Implement gather phase physics: gravitational attraction (force=0.55), damping 0.88
- [x] 7.4 Implement formed phase: flash decay ×0.92, water-ripple sine offset if artifact not ready
- [x] 7.5 Implement gather filler physics: floor bounce at y ≥ H-4 (vy *= -0.3)
- [x] 7.6 Cap particles at 2500
- [x] 7.7 Spawn on text-line destruction (30–50 for >80 chars)
- [x] 7.8 Spawn on tool-card destruction (40–70)
- [x] 7.9 Spawn on per-hop impact: 6×char fragments with letterColorMap
- [x] 7.10 Spawn gather filler particles: ≤50/frame from below viewport until targets filled
- [x] 7.11 Shard system: 4–6 polygon shards on message-card, 500ms life, gravity vy += 0.15

## 8. Gather and formed phases

- [x] 8.1 Render "DSCode" to offscreen canvas at 700px Geist for target rasterization
- [x] 8.2 Sample opaque pixels on 6px grid → targetPoints[], shuffle, cap at 2500
- [x] 8.3 Assign targets to existing particles with per-particle gather delay (20–80ms)
- [x] 8.4 Particle arrival: snap when distance < 4px, set phase "formed", flash = 1
- [x] 8.5 Formed glow: `globalCompositeOperation = "lighter"`, radial gradient at accent color
- [x] 8.6 Particle flash: `lighter` blend when `flash > 0.3`
- [x] 8.7 Water-ripple idle: sine offset amplitude 2.5px per particle
- [x] 8.8 Poll `artifactReadyRef.current` each frame in formed phase
- [x] 8.9 onComplete guard: call exactly once, use ref to prevent double-fire

## 9. Scroll locking

- [x] 9.1 ChatView `scrollLocked` prop: `overflow-hidden pointer-events-none` CSS class
- [x] 9.2 TransitionCanvas programmatic lock: save `scrollTop`, set `overflow: hidden`
- [x] 9.3 Restore `scrollTop` and `overflow` on cleanup
- [x] 9.4 Fallback: ancestor traversal if `scrollContainerRef` is null
- [x] 9.5 Handle cleanup on unmount (React strict mode double-mount safety)

## 10. Dashboard readiness coordination

- [x] 10.1 `handleViewModeChange`: check cache → check reduced-motion → set transitionPhase + fire artifact
- [x] 10.2 `artifactLoadingRef` shared between App and TransitionCanvas via ref
- [x] 10.3 Artifact generation fires immediately at transition start (parallel)
- [x] 10.4 `artifact_end` sets `artifactLoadingRef.current = false`
- [x] 10.5 `handleTransitionComplete`: poll `artifactLoadingRef`, set viewMode + transitionPhase
- [x] 10.6 Cache-hit path: instant view switch, no animation, no artifact generate
- [x] 10.7 Reduced-motion path: skip animation, set artifactLoading, direct view switch on ready

## 11. Theme and color integration

- [x] 11.1 Extract `--color-accent`, `--color-text`, `--color-text-muted` from CSS at init
- [x] 11.2 Derive warmPurple: `hsl(accentHue + 55, 55%, 52%)`
- [x] 11.3 Letter color map: d→accent, s→warmPurple, c→warmYellow, o→text, d→accent, e→teal
- [x] 11.4 Verify light and dark theme color consistency
- [x] 11.5 Dashboard warm color alignment: artifact generation prompt includes warm design tokens

## 12. Performance, accessibility, and polish

- [x] 12.1 60fps target verification on mid-range hardware (MacBook Air M1)
- [x] 12.2 `getBoundingClientRect()` per-frame on 50–200 elements within 2ms budget
- [x] 12.3 ESC key handler: in cascade → startGather, in gather/formed → no-op
- [x] 12.4 Mouse cursor hidden during animation (`cursor: none`), restored on complete
- [x] 12.5 Verify reduced-motion fallback works correctly
- [x] 12.6 Verify opacity transitions don't cause layout shifts
- [x] 12.7 CSS keyframes: scatter animation (±60px, 250ms), code-corrupt (400ms)
- [x] 12.8 Screen shake: `ctx.translate(rand * shake, rand * shake)`, decay ×0.88
- [x] 12.9 Impact rings: expanding white stroked circles, life linear alpha decay
- [x] 12.10 Verify ESC skip: unstruck rows untouched, animation proceeds normally to formed
- [x] 12.11 Verify 0×0 Canvas: recursively rAF-waits for container ready

## 13. Types and cleanup

- [x] 13.1 Update `types.ts`: Particle, ImpactRing, Shard, ClusterState, CascadeRow, AnimationState
- [x] 13.2 Remove unused code from `extractColliders.ts`
- [x] 13.3 Pass typecheck (`npm run typecheck`)
- [x] 13.4 Pass existing tests (`npm test`)
- [x] 13.5 App.tsx integration: transitionPhase state, viewMode, artifactLoading coordination
- [x] 13.6 ViewModeSwitcher: disable dropdown during `transitionPhase === "animating"`
