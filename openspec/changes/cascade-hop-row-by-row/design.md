## Context

`TransitionCanvas.tsx` renders the dashboard transition animation. The current cascade phase is a broken hybrid: independent letters (D, S, C, O) each lock onto the first unstruck row at spawn, strike one row, bounce, and miss all subsequent rows due to X-position mismatch from the initial target. With 4 letters and typically 10+ rows, 60%+ of content is never destroyed. The gather-phase transition requires `allRowsStruck === true`, which never holds — the animation deadlocks.

This design replaces the independent-letter model with a **unified hop-step cluster** — "dscode" rendered as a compact group that hops row-by-row through DOM content via pre-computed parabolic arcs, with squash-stretch deformation on impact and a deliberate dwell pause between hops. The row list extraction is also hardened to exclude parent containers, empty elements, scroll-hidden content, and to use content-tight width measurements.

### Files modified

- `web/src/components/TransitionCanvas.tsx` — cascade phase rewrite
- `web/src/animation/types.ts` — remove `CascadeLetter`, add `ClusterState` and `CascadeRow` fields

### Files NOT modified

- `web/src/components/ChatView.tsx`, `Markdown.tsx`, `ToolCard.tsx` — zero DOM markup changes
- Gather/Formed phase logic, `destroyByType` family, particle/shard/ring systems — unchanged

## Goals / Non-Goals

**Goals:**
- Replace independent letters with unified hop-step cluster that visits every row
- Guarantee 100% row coverage — every visible content-bearing collider is struck
- Fix transition deadlock: cascade always completes and transitions to gather
- Exclude parent containers, empty elements, and scroll-hidden colliders from row list
- Content-tight width for text-like colliders via `measureText`
- Squash-stretch deformation on impact for physical weight
- 300ms dwell between hops with subtle breathing animation
- Random landing X per row with consecutive-row variation constraint

**Non-Goals:**
- Changing gather/formed phases
- Changing per-type destruction effects (`destroyByType`)
- Adding new particle types, ring types, or visual effects
- Modifying the `TransitionCanvas` component API or parent integration
- Making the cluster size adapt per-row (fixed size for 跳一跳 consistency)

## Decisions

### D1: Unified cluster entity replacing independent letters

**Decision**: Replace `CascadeLetter[]` array with a single `ClusterState`:

```typescript
interface ClusterState {
  x: number;           // group center X
  y: number;           // d-bottom Y (contact point)
  // Hop state machine
  hopState: "drop" | "squash" | "stretch" | "dwell" | "hopping";
  hopTimer: number;    // ms remaining in current hop substate
  rowIndex: number;    // current target row (index into s.rows)
  // Arc parameters
  hopStartX: number;
  hopStartY: number;
  hopEndX: number;
  hopEndY: number;
  hopDuration: number; // total hop ms
  hopProgress: number; // 0→1 over hopDuration
  // Deformation
  scaleX: number;
  scaleY: number;
  // Breathing during dwell
  breathPhase: number;
}
```

**Why a single entity**: The independent-letter model cannot guarantee sequential row coverage — letters get stuck at X positions from previous targets. A single entity with a simple `rowIndex` pointer visits rows in order. Physics is pre-computed (parabolic arcs), eliminating all drift/oscillation/stuck-timer complexity.

**Alternative considered**: Keep independent letters but add chain-reassign (bounce → find nearest unstruck → steer toward it). Rejected because 4 bouncing letters competing for targets creates chaotic visual and can't guarantee coverage of rows with divergent X positions.

### D2: Pre-scanned row list with leaf-only filtering

**Decision**: `buildRowList()` runs once at cascade start. It queries all `[data-collider]`, then applies four filters in order:

1. **Nesting exclusion**: Skip if `el.parentElement?.closest('[data-collider]') !== el`. Only leaf colliders enter the list. Parent containers (message-card, tool-card) that serve only as wrappers are excluded.

2. **Empty filter**: Skip if `!el.textContent?.trim()`. Applies to all collider types unconditionally.

3. **Scroll-clip visibility**: Walk up DOM for `overflow-y: auto/scroll` ancestor. If found and element's bounding rect is entirely outside the ancestor's clip region, skip.

4. **Canvas intersection**: Skip rows entirely above or below the canvas.

After filtering, compute landing parameters:
- **Content-tight width**: For text-line, code-line, tool-result-line — measure actual text width via Canvas `measureText` with element's computed font. `row.width = Math.min(rect.width, measuredWidth + 4)`.
- **landingX**: `row.left + rand(row.width * 0.15, row.width * 0.85)`. If consecutive rows share the same X (± cluster width × 0.3), re-roll (max 5 attempts).
- Sort rows by `top` for correct visual order.

**Why leaf-only**: Parent colliders span full-width blank margins. Letters hitting a blank section of a message-card look broken. Leaf colliders (text-line, code-line, etc.) correspond exactly to visible content.

**Why pre-scan**: DOM order is stable during the animation. A single scan avoids per-frame `querySelectorAll` calls.

### D3: Parabolic hop arcs (no gravity accumulation)

**Decision**: Each hop from row N to row N+1 is a pre-computed parabola:

```
hopDuration = max(350ms, sqrt(2 * (hopEndY - hopStartY) / HOP_G))
peakHeight = max(40px, |row_gap| * 1.5)
vy0 = sqrt(2 * HOP_G * peakHeight)
```

Where `HOP_G = 0.002` (px/ms², ~half real gravity for floaty feel). During hopping, `hopProgress` advances from 0→1. The X position uses `easeOutQuad` interpolation from `hopStartX` to `hopEndX`. The Y position follows: `y(t) = hopStartY - (vy0 * t - 0.5 * HOP_G * t²)` where `t = hopProgress * hopDuration / 1000`.

**Why pre-computed arcs**: The cluster always lands exactly at the next row's Y. No accumulated velocity drift, no overshoot, no oscillation. The 1.5× peak height and 350ms minimum duration ensure every hop is visually distinct even for tight row spacing.

**Why easeOutQuad on X**: Linear X interpolation looks mechanical. Ease-out gives a natural "decelerating into landing" feel.

### D4: Hop state machine with dwell

**Decision**: The hop cycle is a 5-state machine driven by `hopTimer`:

```
 ┌─────────┐    80ms    ┌─────────┐    60ms    ┌──────────┐    300ms    ┌────────┐
 │  DROP   │───────────▶│ SQUASH  │──────────▶│ STRETCH  │───────────▶│ DWELL  │
 └─────────┘            └─────────┘            └──────────┘            └────────┘
      │                                                                     │
      │  initial: cluster falls from above-screen onto first row            │
      │                                                                     │
      └─────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼ launch
                                    ┌─────────┐
                                    │ HOPPING │ ──→ lands on next row → SQUASH
                                    └─────────┘     (or all rows done → exit/gather)
```

- **DROP**: Cluster descends from above-screen to first row's Y. Constant velocity (no gravity). Entry condition: `rowIndex === -1`. Duration: computed from distance.
- **SQUASH**: `scaleY` 1.0→0.6, `scaleX` 1.0→1.3 over 80ms. `destroyByType()` fires at t=0 (impact frame). Impact fragments + shake.
- **STRETCH**: `scaleY` 0.6→1.2, `scaleX` 1.3→0.85 over 60ms. Prep rebound.
- **DWELL**: Scales snap to 1.0. Cluster sits on row for 300ms with breathing pulse: `breathScale = 1.0 + sin(breathPhase) * 0.02`. `breathPhase` advances at `2π / 600ms`.
- **HOPPING**: Parabolic arc from current row to next row. At end, `rowIndex++` and transition to SQUASH.

**Why dwell**: Without dwell, the hop cycle (squash 80ms + stretch 60ms + hop ~200-400ms) totals ~350-550ms per row. The viewer sees a rapid ping-pong, not a deliberate jump. The 300ms dwell gives time to register each landing and see the destruction effect.

**Why breathing during dwell**: A perfectly static cluster during dwell looks frozen/broken. The ±2% scale pulse at 1.67Hz conveys "alive and about to jump" without distracting motion.

### D5: Squash-stretch deformation in Canvas rendering

**Decision**: Squash-stretch is applied as a Canvas transform during `drawCluster()`, centered on the cluster's d-bottom contact point:

```typescript
ctx.save();
ctx.translate(clusterX + dFootOffsetX, clusterY); // center on contact foot
ctx.scale(s.scaleX, s.scaleY);
ctx.translate(-(clusterX + dFootOffsetX), -clusterY);
// ... draw each letter at cluster offset ...
ctx.restore();
```

On wide rows (both d and c feet within row bounds), transform centers on midpoint of both feet. On narrow rows (only d-foot within bounds), transform centers on d-foot only. The cluster stays horizontal always — no tilt.

**Why Canvas transform not CSS**: The cluster is drawn on Canvas, not DOM. CSS transforms don't apply. Canvas `scale()` with a strategically chosen transform origin achieves the same squash-stretch effect.

### D6: Dual-foot contact model

**Decision**: The cluster has two contact feet: d-bottom (from d's offset) and c-bottom (from c's offset). When calculating contact with a row:
- If both d and c bottom X fall within `[row.left, row.left + row.width]` → dual-foot contact, transform origin at midpoint.
- If only d-bottom within bounds → single-foot, transform origin at d-bottom. c-side "floats" visually but is acceptable for narrow rows.

The cluster always stays horizontal (never tilts).

**Why dual-foot**: The user's metaphor is explicitly "d and c are left and right feet." Wide rows get both feet; narrow rows get d-foot only. This is automatic based on row width — no configuration needed.

### D7: Cluster sizing and rendering

**Decision**: The cluster renders as 4 letters ("d", "s", "c", "o") in a 2×2 arrangement. Letter size is fixed at 22px — small enough to fit within a single content line height, large enough to read.

```typescript
const CLUSTER_OFFSETS = [
  { char: "d", ox: -10, oy: -8 },
  { char: "s", ox: +4,  oy: -8 },
  { char: "c", ox: -8,  oy: +6 },
  { char: "o", ox: +6,  oy: +6 },
];
// Per-frame jitter: ±2px per letter for organic feel
```

**Why 22px**: Content lines are typically 16-20px. A 22px cluster (~18px body + padding) stays within one line height, preventing visual overlap with adjacent rows. The 跳一跳 metaphor requires a consistent piece size across all platforms.

**Why no rotation**: "不能斜着下落" — the user explicitly prohibits diagonal/slanted motion. A rotating cluster violates the foot-precision metaphor.

### D8: Random landing X with consecutive-row variation

**Decision**: For row at index `i`:
1. Generate `candidateX = row.left + rand(row.width * 0.15, row.width * 0.85)`
2. If `i > 0` and `abs(candidateX - rows[i-1].landingX) < CLUSTER_WIDTH * 0.3`, re-roll (max 5 attempts)
3. Clamp to `[row.left + 4, row.left + row.width - 4]`
4. Accept even if constraint fails after 5 re-rolls

**Why**: Prevents the repetitive straight-down look where all rows are struck at the same X. The constraint ensures visible horizontal variety without creating impossible landing positions.

### D9: Transition-to-gather fix

**Decision**: Replace the broken `allRowsStruck` gate with:

```typescript
// In updateCascade, after hop-state processing:
if (s.rowIndex >= s.rows.length && s.hopState === "hopping" && s.hopProgress >= 1.0) {
  startGather();
}
// Safety fallback: force gather after 8s
if (s.phaseTime > 8000 && !s.gatherStarted) {
  startGather();
}
```

**Why row-index-based**: The cluster visits rows sequentially via `rowIndex`. When `rowIndex >= rows.length`, all rows have been visited. No need to check `row.struck` booleans — the hop state machine guarantees each row is visited once. The 8s safety timeout is a belt-and-suspenders fallback.

### D10: Particle lifecycle in cascade phase

**Decision**: Cascade-phase particles gain a `life` field (ms). They fall downward only (no floor bounce). When `p.y > H + 10` or `life <= 0`, they're removed. This eliminates the "particle rain" effect from particles accumulating and bouncing at the screen bottom.

**Why downward-only**: The cascade phase has a transparent canvas over visible ChatView. Bouncing particles at the bottom distract from remaining content. Particles should spawn on impact, fall, and disappear.

## Risks / Trade-offs

- **[Risk] Very narrow rows may have < 15% usable landing zone** → Mitigation: `landingX` clamping to `[left + 4, left + width - 4]`. Single-foot detection handles extreme narrowness.
- **[Risk] Large row gaps (sparse chat with few messages) produce long hop durations** → Mitigation: The 350ms minimum hop duration floor and 1.5× peak height ensure arcs are visible even for 20px gaps.
- **[Trade-off] Fixed cluster size may look tiny on large tool cards** → Intentional: the 跳一跳 piece stays the same size across all platforms.
- **[Trade-off] Pre-scanned row list cannot react to DOM changes mid-animation** → Acceptable: `buildRowList()` snapshots all rows at animation start. The canvas overlay blocks interaction.
- **[Risk] `measureText` may not perfectly match rendered width for complex inline formatting** → Mitigation: `Math.min(elementRect.width, measuredWidth + 4)` uses the element's bounding rect as an upper bound.
