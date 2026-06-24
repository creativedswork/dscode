## 1. Remove old independent-letter system

- [x] 1.1 Delete `CascadeLetter` interface and all per-letter constants (`SPAWN_SEQUENCE`, `SPAWN_DELAY_MIN/MAX`, `LETTER_SIZE_MIN/MAX`, `GRAVITY_BASE`, `GRAVITY_VARIANCE`, `TERMINAL_VELOCITY`, `BOUNCE_RESTITUTION`, `EXIT_VELOCITY`, `EXIT_FADE_MS`, `LOCK_RELEASE_MS`, `IMPACT_GLOW_MAX`, `IMPACT_GLOW_DECAY`)
- [x] 1.2 Delete `trySpawnLetter()` function entirely
- [x] 1.3 Delete `updateLetterPhysics()` function entirely
- [x] 1.4 Delete `spawnImpactFragments()` (replaced by inline fragment spawn in squash state)
- [x] 1.5 Remove `letters: CascadeLetter[]`, `spawnTimer`, `nextSpawnIndex` from `AnimationState` interface
- [x] 1.6 Remove all per-letter update logic from `updateCascade()` (the for-loop over `s.letters`)

## 2. Add ClusterState interface and hop-state machine

- [x] 2.1 Define `HopState = "drop" | "squash" | "stretch" | "dwell" | "hopping"` and `ClusterState` interface with all fields from design D1
- [x] 2.2 Add cluster fields to `AnimationState`: `cluster: ClusterState`, `scaleX: number`, `scaleY: number`, `breathPhase: number`
- [x] 2.3 Initialize cluster on cascade start: `x = W/2`, `y = -(rand(60, 140))`, `hopState = "drop"`, `rowIndex = -1`
- [x] 2.4 Implement `HOP_G = 0.002`, `SQUASH_MS = 80`, `STRETCH_MS = 60`, `DWELL_MS = 300`, `CLUSTER_SIZE = 22` constants

## 3. Rewrite buildRowList() with content-only filtering

- [x] 3.1 Add nesting exclusion: `el.parentElement?.closest('[data-collider]') !== el` → skip
- [x] 3.2 Move empty filter (`!el.textContent?.trim()`) to apply to all collider types unconditionally
- [x] 3.3 Add scroll-clip visibility check: walk up DOM for `overflow-y: auto/scroll` ancestor, compare bounding rects
- [x] 3.4 Add `landingX` field to `CascadeRow` interface and generate random landing X per row
- [x] 3.5 Add consecutive-row X variation constraint (re-roll up to 5 times)
- [x] 3.6 Add content-tight width via `measureText` for text-line, code-line, tool-result-line
- [x] 3.7 Keep existing canvas-intersection filter (`top >= H || bottom <= 0` → skip)
- [x] 3.8 Keep existing sort-by-Y

## 4. Implement cascade update with hop-state machine

- [x] 4.1 Rewrite `updateCascade()`: remove all letter logic, replace with single cluster hop-state machine
- [x] 4.2 Implement "drop" state: constant-velocity descent to `s.rows[0].top`, transition to "squash" on arrival
- [x] 4.3 Implement "squash" state (80ms): lerp `scaleY 1→0.6`, `scaleX 1→1.3`; fire `destroyByType()` at frame 0; spawn impact fragments; set shake
- [x] 4.4 Implement "stretch" state (60ms): lerp `scaleY 0.6→1.2`, `scaleX 1.3→0.85`; snap to 1.0 at end; transition to "dwell"
- [x] 4.5 Implement "dwell" state (300ms): apply breathing pulse `1.0 + sin(breathPhase) * 0.02`; advance breathPhase; transition to "hopping" on expiry
- [x] 4.6 Implement "hopping" state: pre-compute parabola from current row to next row; `hopDuration = max(350, sqrt(2*gap/HOP_G))`; `peakHeight = max(40, gap*1.5)`; X via `easeOutQuad`; on arrival: `rowIndex++`, transition to "squash"
- [x] 4.7 Implement escape hatch: when `rowIndex >= rows.length` and hop complete, call `startGather()`
- [x] 4.8 Add 8s safety timeout fallback to force `startGather()`

## 5. Rewrite cluster rendering

- [x] 5.1 Rewrite `drawLetters()` → `drawCluster()`: render 4 letters at cluster offsets `[(-10,-8),(+4,-8),(-8,+6),(+6,+6)]` with 22px font
- [x] 5.2 Apply squash-stretch via `ctx.save()` / `ctx.translate()` / `ctx.scale(s.scaleX, s.scaleY)` centered on contact foot
- [x] 5.3 Implement dual-foot vs single-foot transform origin detection
- [x] 5.4 Add per-frame random jitter ±2px per letter for organic feel
- [x] 5.5 Keep per-letter glow rendering on impact (triggered during squash)
- [x] 5.6 Remove all rotation code (`groupRotation`, `groupRotationSpeed`)

## 6. Wire up collision and destruction

- [x] 6.1 Replace per-frame collision scan loop with row-index-based contact detection (cluster Y vs `s.rows[cluster.rowIndex].top`)
- [x] 6.2 In squash frame 0: flash element white, call `destroyByType()`, then schedule opacity transition via `requestAnimationFrame`
- [x] 6.3 Spawn 6–12 impact fragments at cluster position during squash frame 0
- [x] 6.4 Apply element displacement `transform: translate(dx, dy)` with CSS transition
- [x] 6.5 Mark row as struck after destruction

## 7. Update cascade particles

- [x] 7.1 Remove floor bounce from cascade particle update loop
- [x] 7.2 Add downward-only removal: particles exit when `y > H + 10` or `life <= 0`

## 8. Update gather transition and AnimationState

- [x] 8.1 Update `AnimationState` interface: remove `letters`, `spawnTimer`, `nextSpawnIndex`; add `cluster: ClusterState`, `scaleX`, `scaleY`, `breathPhase`
- [x] 8.2 Update cascade initialization in useEffect to use cluster instead of letters
- [x] 8.3 Update `startGather()` to work with cluster state (remove letter-to-particle conversion)
- [x] 8.4 Ensure ESC key handler still works with cluster model

## 9. Clean up types

- [x] 9.1 Update `web/src/animation/types.ts`: remove `Letter` interface (unused)
- [x] 9.2 Remove any remaining dead constants or imports

## 10. Verification

- [x] 10.1 Typecheck with `npx tsc --noEmit -p web/tsconfig.json`
- [x] 10.2 Build with `npm run build:web`
- [ ] 10.3 Manual test: confirm cluster drops from above, squashes on first row, dwells, hops to next row
- [ ] 10.4 Manual test: confirm every visible content row is destroyed with particles
- [ ] 10.5 Manual test: confirm gather phase starts after last row
- [ ] 10.6 Manual test: confirm ESC key still skips to gather
- [ ] 10.7 Manual test: confirm empty chat view (0 rows) falls back to gather after 2s
- [ ] 10.8 Manual test: confirm 8s safety timeout works if rows are unreachable
