## Context

DSCode's Chat → Dashboard transition is a full-viewport Canvas animation that bridges the two view modes. The animation runs client-side only — no server or WebSocket protocol changes. It builds on the existing `session-view-mode` state machine in `App.tsx`, the `artifact-system` WebSocket protocol, and the `warm-design-system` CSS custom properties.

The animation follows a "deconstruct → reconstruct" narrative: a six-letter hop-step cluster ("dscode") cascades through the live ChatView DOM, striking individual content lines and triggering per-type destruction effects. Struck content dissolves into particles, which then converge to form the DSCode wordmark while the dashboard artifact loads in parallel.

Key architectural constraints:
- ChatView remains mounted and visible during animation (transparent Canvas overlay, not replacement)
- Canvas handles particles, cluster, and impact effects only — ChatView DOM provides all background/UI
- Animation must run at 60fps with DPR ≤ 2 and ≤ 2500 particles
- `prefers-reduced-motion` and dashboard-cache hits skip animation entirely
- ESC key in cascade phase jumps to gather

## Goals / Non-Goals

**Goals:**
- Transparent Canvas overlay over visible ChatView DOM during animation
- Six-letter "dscode" cluster in hop-step physics: squash/stretch on impact, dwell pauses, viewport-constrained arc hopping
- Six per-type DOM destruction effects triggered on cluster impact
- Layout-freeze on strike to prevent DOM reflow cascades
- Three-phase state machine: cascade → gather → formed
- Particle convergence to DSCode wordmark (offscreen canvas rasterization)
- Parallel artifact generation during animation; formed phase waits for readiness
- Two-layer scroll locking (CSS class + programmatic overflow:hidden)
- ESC skip and reduced-motion bypass
- Warm design system color integration via CSS custom properties
- 60fps, particle cap 2500, DPR cap 2, dt clamped to 33ms

**Non-Goals:**
- Reverse animation (Dashboard → Chat is instant)
- Mobile/small-viewport animation (fall back to instant)
- Sound effects
- Configurable animation parameters
- TUI integration (web-only)
- Replay capability

## Decisions

### 1. Transparent Canvas overlay over visible ChatView

ChatView remains mounted and visible during the entire animation. The `<canvas>` sits on top with `background: transparent` and `pointer-events: none`. Only particles, cluster, and impact effects are drawn on Canvas. Frame clearing uses `ctx.clearRect(0, 0, W, H)` — no trail effect, no opaque fill.

**Why**: CSS `opacity` transitions on individual DOM elements are GPU-composited and don't interfere with Canvas rendering. The transparent Canvas layer doesn't block the user's view of unstruck chat content. This creates the "chat being dismantled" visual that an opaque Canvas replacement cannot.

**Alternatives considered**: Opaque Canvas with DOM snapshot (loses fidelity, static), Canvas-only (no live DOM context).

### 2. Six-letter hop-step cluster with squash/stretch

Six letters ("dscode") form a unified impact body in a single row (matching the gather-phase wordmark). Physics follow a hop-step state machine:

```
drop → squash (80ms, scaleY: 1→0.6) → stretch (60ms, scaleY: 0.6→1.2) → dwell (300ms, breath) → hopping (350-800ms) → ...
```

Hop arcs use `c.y = lerp(startY, endY, t) - peakHeight × sin(t·π)` with `peakHeight = min(rawPeak, max(0, midY))` to enforce viewport-top containment. Landing X is constrained within row bounds with minimum 21px gap between consecutive landings.

**Why**: The hop-step game feel (跳一跳) is lighter and more precise than free-fall gravity. Squash/stretch communicates impact without rotation/drift. Six letters in a single row match the DSCode wordmark, strengthening brand payoff.

**Alternatives considered**: 4-letter 2×2 grid (didn't match wordmark), free-fall with gravity (cannonball feel), individual homing letters (convergence at shared X).

### 3. Live DOM collision with per-type destruction matrix

Each collidable ChatView element receives a `data-collider` attribute. During cascade, the cluster's foot position is tested against `getBoundingClientRect()` of unstruck leaf elements. On strike:

1. Freeze element layout: lock height, box-sizing, margins/padding/line-height before DOM mutation
2. Call type-specific destruction (see matrix below)
3. Mark element struck; recalculate all row positions

| `data-collider` | Destruction | Visual |
|-----------------|-------------|--------|
| `text-line` | `destroyTextLine()` | Character scatter via CSS keyframes (±60px) |
| `code-line` | `destroyCodeLine()` | Progressive corruption → ▓ replacement |
| `tool-header` | `destroyToolHeader()` | Character scatter (±50px) |
| `tool-result-line` | `destroyToolResultLine()` | Subtle character scatter (±40px) |
| `tool-card` | `destroyToolCard()` | clip-path circle collapse + particle burst |
| `message-card` | `destroyMessageCard()` | White flash + polygon shards |

**Why**: Live DOM manipulation with layout freeze eliminates cascading reflow. Per-type effects create visual variety. Leaf-only filtering prevents double-strikes.

### 4. Three-phase state machine with parallel artifact generation

```
cascade → gather → formed → onComplete()
```

- **cascade**: Cluster hops through rows, striking DOM. All rows struck or ESC → transition to gather.
- **gather**: Particles (from cascade + new spawns) converge to wordmark target points via gravitational physics. 5s safety timeout.
- **formed**: Particles hold position. Water-ripple micro-motion if artifact not ready. `artifactReady && formedTime > 600ms` → onComplete(). 5s safety timeout.

Artifact generation fires immediately on transition start (`App.handleViewModeChange`), so loading happens in parallel with animation.

### 5. Particle system with three-phase physics

| Phase | Physics |
|-------|---------|
| `fall` | vy += 0.28·dtFactor; vx *= 0.995; remove when y > H (no floor bounce) |
| `fall` (gather filler) | Same but floor bounce: y ≥ H-4 → vy *= -0.3 |
| `gather` | Gravitational attraction: vx += dx/dist·0.55; vy += dy/dist·0.55; damping 0.88 |
| `formed` | flash *= 0.92; water-ripple sine offset if artifact not ready |

Particle cap: 2500. Target points generated by rasterizing "DSCode" on offscreen canvas (700px Geist), sampling opaque pixels on 6px grid.

### 6. Layout freeze and position recalibration

`strikeRow()` freezes the struck element's box model (height, box-sizing, margins, padding, line-height) before calling `destroyByType()`. After strike, it recalibrates the struck row's position and all unstruck rows' positions via fresh `getBoundingClientRect()` calls, updating cluster hop targets if mid-hop.

**Why**: DOM mutations (innerHTML replacement in tool-header, text-line) can cause flex/grid reflow and anonymous block-box restructuring. Freeze + recalibrate eliminates cascading position drift.

### 7. Scroll locking (two-layer)

- **Layer 1 (ChatView CSS)**: `scrollLocked` prop → `overflow-hidden pointer-events-none`
- **Layer 2 (TransitionCanvas programmatic)**: `scrollContainerRef` → save scrollTop, set `overflow: hidden`, restore on cleanup. Fallback to ancestor traversal if ref is null.

### 8. Theme color extraction

Animation reads CSS custom properties at init:
```typescript
accent = getComputedStyle(el).getPropertyValue("--color-accent")
text = getComputedStyle(el).getPropertyValue("--color-text")
textMuted = getComputedStyle(el).getPropertyValue("--color-text-muted")
warmPurple = hsl(accentHue + 55, 55%, 52%)
```

Letter color map: d→accent, s→warmPurple, c→warmYellow, o→text, d→accent, e→teal.

## Risks / Trade-offs

- **[Risk] `getBoundingClientRect()` per frame on 50–200 elements** → Each call ~0.01ms; total ~2ms. Within 16ms budget. Throttle to every-other-frame if needed.
- **[Risk] ChatView re-renders during animation** → Content is static during transition (processing guard prevents concurrent operations).
- **[Risk] Dashboard generation takes longer than animation** → Animation stalls in formed state with water-ripple breathing. Acceptable UX; 5s safety timeout.
- **[Risk] Dashboard generation finishes before animation** → Animation plays to completion. 600ms formed settle is brief enough.
- **[Risk] InnerHTML replacement causes flex/grid reflow** → Layout freeze (§6) prevents this at root cause. Position recalibration as belt-and-suspenders.
- **[Risk] Cluster hops above viewport on near-top rows** → `peakHeight ≤ midY` constraint ensures arc stays within viewport bounds.
- **[Risk] Ghost elements from off-screen floating into view** → Layout freeze eliminates root cause; `hideOffscreenColliders()` as redundant safety net.

## Open Questions

- Should there be a subtle sound effect? (Deferred to future iteration.)
- Should animation play on mobile viewports? (Currently falls back to instant switch.)

---

## Architecture

### Component Hierarchy

```
App (state holder)
├── TransitionCanvas      ← Canvas overlay (z-index: 50), phase=animating only
├── ArtifactContainer     ← Dashboard artifact content (iframe)
├── ChatView              ← Chat view (scrollLocked during animation)
│   └── [data-collider]   ← Marked as destructible DOM elements
└── MessageInput          ← Input area (always visible)
```

### Core Participants

| Role | File | Responsibility |
|------|------|----------------|
| `App` (State Machine) | `components/App.tsx` | Holds `viewMode` / `transitionPhase` / `artifactLoading` state, drives UI switching |
| `TransitionCanvas` | `components/TransitionCanvas.tsx` | Full-screen Canvas animation engine: particles, cluster hopping, DOM destruction, render loop |
| `ArtifactContainer` | `components/ArtifactContainer.tsx` | Renders Dashboard HTML artifact in iframe |
| `ChatView` | `components/ChatView.tsx` | Chat list, marks per-line positioning via `data-collider` |
| `ViewModeSwitcher` | `components/ViewModeSwitcher.tsx` | Mode switch UI control (dropdown) |

### Data Flow

```
User clicks ViewModeSwitcher "Dashboard"
  │
  ▼
App.handleViewModeChange("dashboard")
  │
  ├─[cache hit?]──────────────────────────► setViewMode("dashboard")  Instant, no animation
  │
  ├─[prefers-reduced-motion?]─────────────► setViewMode("dashboard")  Skip animation
  │
  └─[normal path]
       ├─ setArtifactHtml("")             Clear old artifact
       ├─ setArtifactLoading(true)        Background generation starts
       ├─ send({ type: "artifact", ... })  Request backend
       └─ setTransitionPhase("animating") ► TransitionCanvas mounts
            │
            ▼
       TransitionCanvas useEffect()
            │
            ├─ Read DOM [data-collider] → build rows[] (viewport only)
            ├─ hideOffscreenColliders() → Set off-screen elements opacity:0
            ├─ Init cluster (above viewport top)
            ├─ Lock ChatView scroll container
            ├─ Start rAF loop
            │
            ├─ Phase 1: CASCADE — cluster hops row-by-row → squash/stretch → strikeRow()
            ├─ Phase 2: GATHER — particles fly from bottom → converge to "DSCode" wordmark
            └─ Phase 3: FORMED — hold + water ripple → wait for artifactReady
                 ready && formedTime > 600ms → onComplete()
                      │
                      ▼
                 handleTransitionComplete()
                      │
                      ├─ Poll artifactLoadingRef === false
                      └─ setTransitionPhase("idle") + setViewMode("dashboard")
```

---

## State Machine

### App Layer

```
viewMode ∈ { "chat", "dashboard" }
transitionPhase ∈ { "idle", "animating" }
artifactLoading: boolean
artifactHtml: string
```

### Animation Internal State

```typescript
type Phase = "cascade" | "gather" | "formed";

interface AnimationState {
  phase: Phase;
  phaseTime: number;
  colors: ThemeColors;
  particles: Particle[];       // ≤ MAX_PARTICLES (2500)
  impactRings: ImpactRing[];
  shards: Shard[];
  shake: number;
  formedTime: number;
  targetPoints: {x,y}[];       // "DSCode" rasterized targets
  particlesAssigned: number;
  gatherStarted: boolean;
  W: number; H: number;
  cluster: ClusterState;
  rows: CascadeRow[];
  scaleX: number; scaleY: number;
  breathPhase: number;
  letterColorMap: Record<string, string>;
}
```

### Cluster Sub-State Machine

```
drop → squash → stretch → dwell → hopping → squash → … → (all rows struck) → gather
        80ms      60ms      300ms     variable
```

---

## Animation Pipeline

```
t=0          t=~0.8s     t=~3-8s       t=+0.6s
  │              │           │              │
  ▼              ▼           ▼              ▼
┌──────┐    ┌─────────┐ ┌──────────┐  ┌──────────┐
│CASCADE│───►│ GATHER  │►│ FORMED   │─►│onComplete│
│cluster│    │particles│ │(water    │  │callback  │
│hops   │    │converge │ │ ripple)  │  │          │
└──────┘    └─────────┘ └──────────┘  └──────────┘
```

### Phase 1: CASCADE

1. **Init**: `buildRowList()` scans viewport `[data-collider]` → rows[]. `hideOffscreenColliders()` sets off-screen elements to opacity:0.
2. **Hop-step**: Cluster falls from `(W/2, -random(60,140))`. Each hop: squash→stretch→dwell→hop to next row.
3. **Strike**: `strikeRow()` freezes element layout → calls `destroyByType(el, impactX, impactY)`.
4. **Recalibrate**: After each strike, remeasure struck row + all unstruck rows' positions.

### Phase 2: GATHER

1. **Target generation**: Render "DSCode" on offscreen canvas at 700px Geist → sample opaque pixels → targetPoints[].
2. **Assignment**: `particlesAssigned` pointer maps existing + new particles to targets.
3. **Physics**: Gravitational attraction (force=0.55), snap at dist<4px → flash + impact ring + shake.
4. **Safety timeout**: 5s → forced gather.

### Phase 3: FORMED

- Particles hold position; flash decays exponentially.
- If artifact not ready: water-ripple sine offset (amplitude 2.5px).
- `artifactReadyRef.current === true && formedTime > 600ms` → `onComplete()`.
- Safety timeout: 5s → forced complete.

---

## Particle System

### Data Structure

```typescript
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  color: string;
  phase: "fall" | "gather" | "formed";
  tx?: number; ty?: number;
  gatherDelay?: number;
  flash?: number;
  life?: number;
}
```

### Spawn Strategies

| Scenario | Count | Color | Source |
|----------|-------|-------|--------|
| `destroyTextLine` (short) | Character scatter (CSS), no particles | — | CSS keyframes |
| `destroyTextLine` (long >80chars) | 30–50 | warmColors random | `spawnParticles()` |
| `destroyToolCard` | 40–70 | accent + warmPurple | `destroyToolCard()` |
| `destroyMessageCard` | 4–6 shards | textMuted | `destroyMessageCard()` |
| Per-hop impact | 6×char | letterColorMap[char] | `spawnImpactFragments()` |
| Gather filler | ≤50/frame until targetPoints filled | text | `updateGather()` |

### Shard System

```typescript
interface Shard {
  x: number; y: number;
  vx: number; vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  life: number;              // 500ms
  points: {x,y}[];           // Random polygon vertices
}
```

Shards generated only in `destroyMessageCard`, 4–6 polygon pieces from card center.

---

## Hop-Step Cluster System

### Letter Offsets

```typescript
const CLUSTER_OFFSETS = [
  { char: "d", ox: -40, oy: 0 },
  { char: "s", ox: -24, oy: 0 },
  { char: "c", ox: -8,  oy: 0 },
  { char: "o", ox: +8,  oy: 0 },
  { char: "d", ox: +24, oy: 0 },
  { char: "e", ox: +40, oy: 0 },
];
```

### Landing X Constraints
1. If row width ≥ CLUSTER_WIDTH(70px): random within `[left + 40, left + width - 40]`
2. Otherwise: row midpoint
3. Consecutive landing X gap ≥ CLUSTER_WIDTH × 0.3 (re-random up to 5 times)

### Drawing

`ctx.translate(originX, cy) → ctx.scale(sx, sy) → ctx.translate(-originX, -cy)` for impact-foot-anchored squash/stretch.

### Hop Arc Viewport Constraint

`peakHeight = min(rawPeak, max(0, midY))` where `rawPeak = max(40, gap × 0.55)`. This ensures cluster stays within viewport when near top rows.

---

## Render Pipeline

### Per-Frame Draw Order

```
1. ctx.clearRect(0, 0, W, H)
2. ctx.save()
3. [shake]            ctx.translate(rand(-shake, shake), rand(-shake, shake))
4. drawFormedGlow()   ← formed phase only, radial gradient breathing
5. drawCluster()      ← cascade phase only, 6-letter cluster
6. drawParticles()    ← all phases
7. drawRings()        ← impact rings (semi-transparent white arcs)
8. drawShards()       ← polygon shards
9. ctx.restore()
10. drawHUD()          ← bottom-right status label (Geist Mono 11px)
```

### Technical Details

- **Formed glow**: `globalCompositeOperation = "lighter"`, radial gradient at accent color
- **Particle flash**: `lighter` blend when `flash > 0.3`
- **Rings**: Pure white stroke, life-linear alpha decay
- **HUD label**: 11px Geist Mono, bottom-right, textMuted

---

## CSS / Theme Integration

### Theme Color Extraction

```typescript
const accentHex = getComputedStyle(documentElement).getPropertyValue("--color-accent").trim();
const text = getComputedStyle(documentElement).getPropertyValue("--color-text").trim();
const textMuted = getComputedStyle(documentElement).getPropertyValue("--color-text-muted").trim();
```

### data-collider Attributes

| Value | Source Component | Description |
|-------|-----------------|-------------|
| `message-card` | ChatView → MessageBubble | User/assistant message card |
| `text-line` | Markdown.tsx | Rendered text paragraph |
| `code-line` | Markdown.tsx | Code block line |
| `tool-card` | ToolCard.tsx | Tool call card container |
| `tool-header` | ToolCard.tsx | Tool name/status header |
| `tool-result-line` | ToolCard.tsx | Tool result text line |

**Nesting filter**: `buildRowList()` skips elements containing child `[data-collider]`, keeping only leaf nodes.

---

## Edge Cases & Fault Tolerance

| Case | Behavior |
|------|----------|
| `prefers-reduced-motion` | Skip animation, instant switch |
| Dashboard cache hit | Skip animation, instant render |
| Empty ChatView (no rows) | `buildRowList()` returns []; 2s timeout → startGather |
| 0×0 Canvas | `firstFrame()` recursively rAF-waits for container |
| Consecutive X too close | Re-random up to 5 times |
| Off-screen rows | `hideOffscreenColliders()` sets opacity:0 at start |
| Ghost elements | Layout freeze prevents reflow; hideOffscreenColliders as safety net |
| Cursor | `document.body.style.cursor = "none"` during animation |
| ESC key | In cascade → `startGather()` directly |

## Key Files

| File | Lines | Description |
|------|-------|-------------|
| `web/src/components/TransitionCanvas.tsx` | ~1217 | Animation engine |
| `web/src/components/App.tsx` | ~329 | State machine + transition trigger |
| `web/src/components/ChatView.tsx` | ~139+ | data-collider source |
| `web/src/components/ArtifactContainer.tsx` | ~72 | Dashboard renderer |
| `web/src/components/ViewModeSwitcher.tsx` | ~32 | View switch control |
| `web/src/animation/types.ts` | ~36 | Particle/ImpactRing/Shard types |
| `web/src/index.css` | ~258 | Theme variables + CSS animations |

## Animation Time Budget

| Phase | Min | Typical | Max |
|-------|-----|---------|-----|
| Cascade (n rows) | n×(80+60+300+350) ≈ 0.8s×n | — | ESC skip |
| Gather | ~0.8s | ~2s | 5s timeout |
| Formed | 0.6s | ~1–3s (waiting for artifact) | 5s timeout |
| **Total** | **~1.5–3s** | **~5–8s** | **~12s (worst)** |
