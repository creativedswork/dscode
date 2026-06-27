---
name: web-ui-motion
description: >-
  Build polished front-end UI together with a signature motion effect in a single
  self-contained HTML file, combining SVG.js / SVG filters and the Canvas 2D API.
  Use when the user asks to build a web page, landing page, dashboard, or component
  that has a special visual effect, animation, particle system, fluid/water distortion,
  text-reveal, deconstruction/reconstruction, or any "make the UI react / ripple / shatter /
  reassemble" request. Covers three worked patterns: (1) mouse-driven water ripple distortion
  over real UI, (2) particle cascade that deconstructs UI and rebuilds it as text, and
  (3) hop-step cluster that strikes DOM elements row-by-row with squash/stretch physics.
---

# Web UI Motion Effects (SVG.js + Canvas)

Build a **complete, good-looking UI** and then layer a **signature motion effect** on top. Ship it as one self-contained `.html` file (inline CSS + JS, fonts from a CDN). The reference examples in this folder are the gold standard for quality — match their level of polish.

## Deliverable contract

- Single `.html` file, runs by double-click, no build step.
- The UI is genuinely designed (typography, color system via CSS variables, spacing, hierarchy) — not a gray box with an effect slapped on.
- The effect is the centerpiece, smooth at 60fps, and degrades gracefully.
- Always honor `prefers-reduced-motion` and high-DPI screens (see Performance below).

## Step 1 — Pick the rendering layer

Decide per-effect. Most rich pieces combine both.

| Use **SVG / SVG.js** when | Use **Canvas 2D** when |
|---|---|
| The real HTML/SVG UI must stay live, selectable, accessible | You need hundreds–thousands of particles |
| Distortion / blur / glow over existing DOM (`feTurbulence`, `feDisplacementMap`, `feGaussianBlur`) | Per-frame physics: gravity, collision, seeking, impact |
| A handful of vector shapes you tween declaratively | You sample pixels (`getImageData`) to form shapes/text |
| Crisp resolution-independent vectors | Heavy full-screen redraw with trails/additive blending |

**Combine pattern (used by all examples):** render the real UI in HTML/SVG, then overlay a `<canvas>` (`position:fixed; inset:0; pointer-events:none`) for the particle/ripple layer. Apply SVG `filter:url(#...)` to the DOM for distortion; drive the canvas overlay separately so it stays sharp.

`SVG.js` (https://github.com/svgdotjs — `svg.js`, plus `svg.filter.js` for filters) is the recommended way to build and animate the SVG layer programmatically. Load via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/@svgdotjs/svg.js@3/dist/svg.min.js"></script>
```

You may also author SVG filters as static markup (as example 1 does) and only toggle their attributes from JS — that is simpler and fine.

## Step 2 — Build the effect

Read the worked examples for full, copyable implementations:

- **`examples/water-ripple.html`** — Pattern A: mouse-driven water ripple.
- **`examples/deconstructive.html`** — Pattern B: particle deconstruction & reconstruction.
- **Pattern C below** — Hop-step cascade cluster (dscode TransitionCanvas).
- **`reference.md`** — distilled techniques, gotchas, and reusable snippets from all.

### Pattern A — Mouse-driven water ripple (SVG filter + Canvas)

Prompt this answers: *"实现一个前端 UI，并实现一个特效，当鼠标滑动 UI 内容，这些 UI 像水一样被鼠标波动。"*

Core idea: wrap the whole UI in a container with `filter:url(#water)`, where the filter is `feTurbulence` → `feDisplacementMap(in=SourceGraphic)`. The displacement `scale` and the turbulence `baseFrequency` are animated every frame from **mouse velocity**, so faster movement = stronger warp. A separate Canvas draws expanding ripple rings at the cursor.

```html
<filter id="water" x="-20%" y="-20%" width="140%" height="140%">
  <feTurbulence id="turb" type="fractalNoise" baseFrequency="0.014 0.018" numOctaves="2" seed="3" result="noise"/>
  <feDisplacementMap id="disp" in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G"/>
</filter>
```

```js
// velocity -> target distortion; ease toward it every frame
let velocity = 0, targetScale = 0, currentScale = 0, lastX, lastY;
addEventListener('mousemove', e => {
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  velocity = velocity*0.6 + Math.hypot(dx, dy)*0.4;
  lastX = e.clientX; lastY = e.clientY;
  targetScale = Math.min(velocity * 1.2, 90);
  spawnRipple(e.clientX, e.clientY, Math.min(Math.hypot(dx,dy), 40)); // canvas overlay
});
function tick(t){
  velocity *= 0.9; targetScale *= 0.92;
  const baseScale = 4 + Math.sin(t*0.0006)*1.5;          // idle "breathing"
  currentScale += (baseScale + targetScale - currentScale) * 0.18; // smoothing
  disp.setAttribute('scale', currentScale.toFixed(2));
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

Keys: keep interactive elements (`hover`, buttons) **outside** the distorted subtree or re-bind their transforms, since heavy filters can dull pointer feel. Always ease values — never set `scale` directly to raw velocity.

### Pattern B — Particle deconstruction & reconstruction (Canvas)

Prompt this answers: *letters fall from the top; each text line / UI-component edge is a collider; on hit the letter bounces, the collider deactivates and shatters into particles that fall under gravity; once all UI is consumed the particles converge to center like bullets hitting a board and assemble into "DSCode".*

State machine: `intro → falling → gather → formed`.

1. **Build UI as colliders.** Represent every UI piece (text, card, line) as an object with an AABB `{x,y,w,h,active}` and a `draw()` so the same data is both *rendered UI* and *physics body*. Stagger a `born` time for an entrance animation.
2. **Falling + collision.** Spawn falling letters (`d s c o d e`) with gravity. AABB-test each letter against active colliders; on hit: bounce the letter (flip `vy`, add random `vx`/spin), set `collider.active=false`, and call `explodeCollider()`.
3. **Explode.** Emit particles along the element's perimeter/area, each `{x,y,vx,vy,size,color,phase:'fall'}`. Add a screen `flash` + `shake` for impact.
4. **Gather → form text.** When every collider is inactive, render the target word to an **offscreen canvas**, `getImageData`, and collect opaque pixels on a grid (`step≈6`) as target points. Shuffle, assign one target per particle with a random `gatherDelay`, then switch particles to a `gather` phase that accelerates toward the target ("bullet") and snaps to `formed` with an impact ring on arrival.

```js
// sample target points from text rendered offscreen
octx.font = `700 ${fontSize}px "Space Grotesk"`;
octx.fillText('DSCode', W/2, H/2);
const img = octx.getImageData(0,0,W,H).data;
for (let y=0; y<H; y+=6) for (let x=0; x<W; x+=6)
  if (img[(y*W+x)*4+3] > 128) targets.push({x, y});
```

Keys: use a translucent fill each frame (`rgba(bg,0.22)`) instead of `clearRect` to get motion trails. Sample with a `step` (not every pixel) so target count stays a few thousand. Snap particles exactly to target on arrival to avoid jitter.

### Pattern C — Hop-step cascade cluster (Canvas overlay + DOM collision)

Prompt this answers: *a letter cluster ("dscode") drops from above the viewport, hops from DOM element to DOM element top-to-bottom, destroying each on impact with squash/stretch physics, then all particles gather to form the target word.*

This is the dscode TransitionCanvas pattern — a **Canvas-only overlay** that reads live DOM positions via `data-collider` attributes and renders the cluster, particles, and impact effects on a transparent `<canvas>` (z-index: 50, `pointer-events: none`, `background: transparent`). The real HTML UI stays mounted beneath and provides all visual content for unstruck elements.

**Architecture overview:**

```
┌─ Canvas overlay (transparent, pointer-events:none) ─┐
│  Cluster: "ds code" letters hopping row to row       │
│  Particles: burst on strike, converge in gather      │
│  Impact rings, shards, screen shake                  │
│  HUD label in bottom-right                           │
└──────────────────────────────────────────────────────┘
┌─ Real DOM (ChatView) ────────────────────────────────┐
│  [data-collider="text-line"]   ← struck → destroyed  │
│  [data-collider="code-line"]   ← struck → corrupted  │
│  [data-collider="tool-card"]   ← struck → clip-path  │
│  [data-collider="message-card"]← struck → shards     │
└──────────────────────────────────────────────────────┘
```

**State machine:** `cascade → gather → formed`

**Cluster hop states:** `drop → squash → stretch → dwell → hopping → squash → ...`

**Step 1 — Mark DOM elements with `data-collider` attributes.**

Each destroyable UI piece gets a `data-collider` attribute that the Canvas code queries at runtime to build its row list:

| Attribute value | Typical element | Destruction effect |
|---|---|---|
| `text-line` | `<span>` wrapping a text paragraph line | Character scatter via CSS `@keyframes` |
| `code-line` | `<span>` inside a code block | Progressive character corruption (→ `▓`) then fade |
| `tool-card` | Card container for a tool call | `clip-path: circle()` shrink from impact point + particle burst |
| `tool-header` | Tool name header inside a card | Character scatter (smaller radius) |
| `tool-result-line` | Result text line inside a tool card | Light scatter with shorter range |
| `message-card` | User/assistant message bubble | Light bg flash + shards; children (inner lines) still struck individually |
| `table-cell` | Table cell content | Treated same as `text-line` |

**Step 2 — Build the row list from live DOM queries.**

```js
function buildRowList() {
  const all = container.querySelectorAll('[data-collider]');
  const rows = [];
  all.forEach(el => {
    // Skip nested colliders (leaf-only), empty/whitespace elements
    if (el.querySelector('[data-collider]')) return;
    if (!el.textContent?.trim()) return;
    const rect = el.getBoundingClientRect();
    // Filter: must intersect canvas viewport
    if (rect.bottom <= 0 || rect.top >= H) return;
    // Compute content-tight width via measureText for text types
    let width = rect.width;
    if (colliderType === 'text-line' || colliderType === 'code-line') {
      width = measureCtx.measureText(el.textContent).width + 4;
    }
    // Random landing X within the element's horizontal bounds
    const landingX = (width >= CLUSTER_WIDTH)
      ? left + clusterHalf + rand(0, width - CLUSTER_WIDTH)
      : left + width / 2;
    rows.push({ el, top, left, width, height, landingX, struck: false });
  });
  // Sort top-to-bottom
  rows.sort((a, b) => a.top - b.top);
  // Enforce X variation between consecutive rows
  for (let i = 1; i < rows.length; i++) {
    while (Math.abs(rows[i].landingX - rows[i-1].landingX) < CLUSTER_WIDTH * 0.3) {
      rows[i].landingX = /* re-roll */;
    }
  }
  return rows;
}
```

**Step 3 — Cluster physics: the hop-step state machine.**

The cluster is a 1×6 row of letters ("d", "s", "c", "o", "d", "e") with fixed offsets:

```js
const CLUSTER_OFFSETS = [
  { char: "d", ox: -40, oy: 0 }, { char: "s", ox: -24, oy: 0 },
  { char: "c", ox: -8,  oy: 0 }, { char: "o", ox: +8,  oy: 0 },
  { char: "d", ox: +24, oy: 0 }, { char: "e", ox: +40, oy: 0 },
];
```

Each letter has a per-letter color (e.g. `d`=accent, `s`/`c`=warm accent 2, `o`=muted, `e`=text).

The cluster state machine per row:

```
          ┌──────────────────────────────────────┐
          │                                      ▼
┌──────┐  ┌──────┐  ┌───────┐  ┌──────┐  ┌─────────┐
│ drop │→│squash│→│stretch│→│ dwell │→│ hopping │→ squash (next row)
└──────┘  └──────┘  └───────┘  └──────┘  └─────────┘
   │                      △                        │
   │            breathing idle (600ms cycle)       │
   │                                              │
   └── no rows → skip to gather ──────────────────┘
```

**Drop:** descend from above-screen at constant speed until reaching the first row's top.
```js
case "drop":
  c.y += DROP_SPEED * dtFactor;
  if (c.y >= rows[0].top) { c.y = rows[0].top; c.hopState = "squash"; strikeRow(); }
  break;
```

**Squash:** scaleY compresses to 0.6, scaleX expands to 1.3 over ~80ms.
```js
case "squash":
  const t = clamp(1 - c.hopTimer / SQUASH_MS, 0, 1);
  s.scaleY = lerp(1.0, 0.6, t);   // compress vertically
  s.scaleX = lerp(1.0, 1.3, t);   // widen horizontally
  if (c.hopTimer <= 0) c.hopState = "stretch";
  break;
```

**Stretch:** overshoot recovery — scaleY goes to 1.2, scaleX to 0.85 over ~60ms.
```js
case "stretch":
  s.scaleY = lerp(0.6, 1.2, t);
  s.scaleX = lerp(1.3, 0.85, t);
  if (c.hopTimer <= 0) { s.scaleX = 1; s.scaleY = 1; c.hopState = "dwell"; }
  break;
```

**Dwell:** subtle breathing scale oscillation (600ms cycle, ±2%) while waiting before the next hop.
```js
case "dwell":
  const breathScale = 1.0 + Math.sin(s.breathPhase) * 0.02;
  s.scaleX = breathScale; s.scaleY = breathScale;
  if (c.hopTimer <= 0) launchHop();
  break;
```

**Hopping:** sine-arc trajectory from current row to next, with peak height proportional to gap.
```js
case "hopping":
  const et = easeOutQuad(t);
  const gap = Math.abs(c.hopEndY - c.hopStartY);
  const peakHeight = Math.min(gap * 0.55, midY);
  c.y = lerp(c.hopStartY, c.hopEndY, t) - peakHeight * Math.sin(t * Math.PI);
  c.x = lerp(c.hopStartX, c.hopEndX, et);
  if (t >= 1.0) { c.rowIndex = nextIndex; c.hopState = "squash"; strikeRow(); }
  break;
```

**Launching the next hop:** after dwell, find the next unstruck row whose top is ≥ current row top. Skip rows shifted above or off-screen. If no valid next row, transition to gather.

**Step 4 — Strike a row: DOM destruction + impact effects.**

On strike:
1. **Snapshot pre-mutation position** of the row element (to compensate for layout shift)
2. **Lock layout** — force `display: inline-block`, explicit `height`, freeze margins/padding/line-height to prevent cascade drift when siblings reflow
3. **Measure position delta** caused by the layout freeze, compute compensating `translate(dx, dy)`
4. **Snapshot inner scroll position** of any scroll ancestor (e.g. `max-h-40` tool card containers) before DOM mutation
5. **Call `destroyByType()`** — dispatches to type-specific destruction:
   - `text-line` / `tool-header` / `tool-result-line`: split into `<span>` chars with CSS `@keyframes` scatter (translate + rotate + opacity→0 over 300–400ms)
   - `code-line`: progressive corruption — replace characters with `▓` in 3 stages (30% → 60% → 100%), then fade
   - `tool-card`: `clip-path: circle(0%)` shrink from impact point + 40–70 particle burst
   - `message-card`: light bg flash + 4–6 geometric shards; does NOT hide the card (children need to remain visible for individual striking)
6. **Restore inner scroll position** to prevent cumulative drift
7. **Apply white flash + box-shadow** to the struck element, then fade out
8. **Spawn impact fragments** from all six cluster letter positions (per-letter color)
9. **Cleanup parent container** — if all children of a tool-card or message-card are struck, spawn additional particles and fade the parent
10. **Recalibrate all unstruck row positions** — DOM mutation can shift siblings; re-measure all remaining rows via `getBoundingClientRect()`, resort, update the cluster's current row index

```js
function strikeRow() {
  const row = s.rows[c.rowIndex];
  row.struck = true;

  // Pre-freeze position snapshot
  const preTop = row.el.getBoundingClientRect().top - canvasRect.top;

  // Lock layout to prevent sibling reflow
  const cs = getComputedStyle(row.el);
  if (cs.display === "inline") { row.el.style.display = "inline-block"; }
  row.el.style.height = row.height + "px";
  row.el.style.marginTop = cs.marginTop; /* ... etc */

  // Measure position delta and compensate
  const postTop = row.el.getBoundingClientRect().top - canvasRect.top;
  const compensateDy = preTop - postTop;

  destroyByType(row.el, impactX, impactY);

  // Apply shake + compensation transform
  row.el.style.transform = `translate(${compensateDx + rand(-8,8)}px, ${compensateDy + rand(-4,2)}px)`;

  // Spawn impact fragments from all six letters
  for (const offset of CLUSTER_OFFSETS) {
    spawnImpactFragments(c.x + offset.ox, c.y + offset.oy, letterColorMap[offset.char]);
  }

  // Recalibrate all unstruck rows
  recalibrateRows();
}
```

**Step 5 — Gather phase: particles converge to target text.**

After all rows are struck (or ESC key pressed, or 8s safety timeout), transition to gather:

1. Render "DSCode" to an offscreen canvas, sample pixel data on a step-6 grid
2. Compute per-letter X boundaries so each target pixel knows which letter it belongs to
3. Shuffle targets, assign to existing particles with random `gatherDelay` (20–80ms)
4. Spawn filler particles from the bottom edge if particles < targets (capped at MAX_PARTICLES=2500)
5. Each particle: `fall` phase (gravity + floor bounce) → when `gatherDelay` expires → `gather` phase (bullet-seek toward target) → when `dist < 4` → `formed` (snap + flash + impact ring)

```js
// Bullet-like seek (gather phase)
const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
if (dist < 4) {
  p.x = p.tx; p.y = p.ty; p.phase = "formed"; p.flash = 1;
  s.impactRings.push({ x: p.x, y: p.y, r: 2, life: 1 });
  s.shake = Math.min(s.shake + 2.5, 8);
} else {
  const force = 0.55;
  p.vx += (dx / dist) * force;
  p.vy += (dy / dist) * force;
  p.vx *= 0.88; p.vy *= 0.88;
  p.x += p.vx; p.y += p.vy;
}
```

**Step 6 — Formed phase: ripple idle + completion.**

Once all particles are formed (or after 5s fallback timeout):
- Particles idle with a decaying `flash` value (×0.92/frame) for landing sparkle
- A slow radial gradient glow breathes at the center
- If `artifactReady` is true (external signal), water-ripple displacement is applied to formed particles:
  ```js
  dx += Math.sin(p.y * 0.04 + t * 0.002) * Math.cos(p.x * 0.03 + t * 0.0015) * 2.5;
  dy += Math.cos(p.x * 0.04 + t * 0.002) * Math.sin(p.y * 0.03 + t * 0.0015) * 2.5;
  ```
- After 600ms of formed + artifactReady, call `onComplete()` to unmount the canvas

**Drawing order (per frame):**

```js
function frame(now) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (s.shake > 0.1) ctx.translate(rand(-s.shake, s.shake), rand(-s.shake, s.shake));
  drawFormedGlow(now);   // radial gradient center glow (formed phase only)
  drawCluster();         // 6-letter cluster with scaleX/scaleY transform
  drawParticles();       // all particles; additive blending for flashing formed ones
  drawRings();           // expanding impact rings with fading alpha
  drawShards();          // geometric shards with rotation + alpha decay
  ctx.restore();
  drawHUD();             // phase label in bottom-right (Geist Mono, 11px)
  updateCascade/Gather/Formed(dt);
  rafId = requestAnimationFrame(frame);
}
```

**Per-frame update notes:**
- Cascade particles: gravity `vy += 0.28`, off-screen removal (`y > H + 10`), life-based expiration
- Gather particles: same gravity + floor bounce (`y > H - 4 → vy *= -0.3`), seek logic
- Shards: gravity `vy += 0.15`, life-based removal
- Impact rings: `r += 2.2` (cascade/gather), `r += 1.5` (formed); `life -= 0.03–0.045`
- Shake: decays `*= 0.88` per frame

**Key techniques specific to this pattern:**

- **Layout freeze before DOM mutation:** locking `display`, `height`, margins, padding, and `line-height` prevents sibling reflow when an element is destroyed. Measure the position delta and apply a compensating `translate()`.
- **Inner scroll preservation:** snapshot `scrollTop` of overflow-y ancestors before `innerHTML` replacement; restore afterward to prevent content drift in scrollable cards.
- **Consecutive-row X variation:** enforce minimum horizontal distance between consecutive row landing points so the cluster traverses diagonally rather than dropping straight down.
- **ESC to skip cascade:** pressing Escape during cascade immediately triggers the gather phase.
- **Safety timeout:** if cascade hasn't completed after 8s, force transition to gather.
- **Scroll lock:** during the animation, the scroll container's `overflow` is set to `hidden` and scroll position is saved/restored on unmount.

## Step 3 — Polish & verify

Quality bar (all examples hit all of these):

- Cohesive palette + 2 web fonts; CSS variables for theme.
- An idle/ambient state (breathing distortion, drifting bubbles, sweeping sonar) so it's alive before interaction.
- Impact feedback: flash, shake, glow, rings — motion should feel physical.
- A clear phase indicator / replay affordance for sequenced effects.

Then open the file in a browser and watch a full cycle.

## Performance & accessibility (always do)

```js
// High-DPI canvas
dpr = Math.min(window.devicePixelRatio || 1, 2);
cv.width = W*dpr; cv.height = H*dpr;
cv.style.width = W+'px'; cv.style.height = H+'px';
ctx.setTransform(dpr,0,0,dpr,0,0);
```

```css
@media (prefers-reduced-motion: reduce){ *{ animation-duration:.01ms !important } }
```

- Cap particle counts; bail out of spawners past a budget (`if (ripples.length>40) return;`).
- Clamp `dt` (`Math.min(33, t-last)`) so background tabs don't explode physics.
- Start the loop after `document.fonts.ready` when the effect measures or rasterizes text.
- For Pattern C: hide off-screen colliders (`opacity: 0`) before the cascade loop begins.
- For Pattern C: skip colliders that are empty or entirely outside their scroll ancestor's visible region.

## Additional resources

- `reference.md` — deeper technique catalog, parameter cheat-sheet, common pitfalls.
- `examples/water-ripple.html`, `examples/deconstructive.html` — full reference implementations.
- The production Pattern C implementation lives at `web/src/components/TransitionCanvas.tsx` in the dscode monorepo — a React-embedded variant with full DOM-collider integration, layout-freeze compensation, and inner-scroll-preservation logic.
