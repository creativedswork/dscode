---
name: web-ui-motion
description: >-
  Build polished front-end UI together with a signature motion effect in a single
  self-contained HTML file, combining SVG.js / SVG filters and the Canvas 2D API.
  Use when the user asks to build a web page, landing page, dashboard, or component
  that has a special visual effect, animation, particle system, fluid/water distortion,
  text-reveal, deconstruction/reconstruction, or any "make the UI react / ripple / shatter /
  reassemble" request. Covers two worked patterns: (1) mouse-driven water ripple distortion
  over real UI, and (2) particle cascade that deconstructs UI and rebuilds it as text.
---

# Web UI Motion Effects (SVG.js + Canvas)

Build a **complete, good-looking UI** and then layer a **signature motion effect** on top. Ship it as one self-contained `.html` file (inline CSS + JS, fonts from a CDN). The two reference examples in this folder are the gold standard for quality — match their level of polish.

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

**Combine pattern (used by both examples):** render the real UI in HTML/SVG, then overlay a `<canvas>` (`position:fixed; inset:0; pointer-events:none`) for the particle/ripple layer. Apply SVG `filter:url(#...)` to the DOM for distortion; drive the canvas overlay separately so it stays sharp.

`SVG.js` (https://github.com/svgdotjs — `svg.js`, plus `svg.filter.js` for filters) is the recommended way to build and animate the SVG layer programmatically. Load via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/@svgdotjs/svg.js@3/dist/svg.min.js"></script>
```

You may also author SVG filters as static markup (as example 1 does) and only toggle their attributes from JS — that is simpler and fine.

## Step 2 — Build the effect

Read the two worked examples for full, copyable implementations:

- **`examples/water-ripple.html`** — Pattern A: mouse-driven water ripple.
- **`examples/deconstructive.html`** — Pattern B: particle deconstruction & reconstruction.
- **`reference.md`** — distilled techniques, gotchas, and reusable snippets from both.

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

## Step 3 — Polish & verify

Quality bar (both examples hit all of these):

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

## Additional resources

- `reference.md` — deeper technique catalog, parameter cheat-sheet, common pitfalls.
- `examples/water-ripple.html`, `examples/deconstructive.html` — full reference implementations.
