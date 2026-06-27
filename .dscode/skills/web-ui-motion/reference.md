# Reference — UI Motion Techniques

Distilled, reusable techniques behind the two example files. Read `SKILL.md` first for the workflow; come here for parameters, snippets, and pitfalls.

## SVG.js essentials

`SVG.js` (https://github.com/svgdotjs) is a thin, chainable wrapper over the SVG DOM. Use it when you want to build/animate the vector layer in JS instead of hand-writing markup.

```html
<script src="https://cdn.jsdelivr.net/npm/@svgdotjs/svg.js@3/dist/svg.min.js"></script>
```

```js
const draw = SVG().addTo('#stage').size('100%', '100%');
const c = draw.circle(80).fill('#2bd9c0').center(200, 120);
c.animate(1200).move(300, 60).loop(true, true);   // built-in tweening
draw.line(0,0,400,200).stroke({ width:1.5, color:'#5ab9ff' });
```

Useful pieces:
- `el.animate(duration, delay, when).attr({...}).ease('<>')` — declarative tweens with easing.
- `svg.filter.js` plugin for fluent filters: `el.filter(add => { ... })`.
- For physics-heavy or pixel-sampling effects, **don't** use SVG.js — use Canvas (Pattern B).

When the filter is mostly static and you only animate a couple of attributes per frame, plain markup + `setAttribute` (as in `examples/water-ripple.html`) is lighter than the SVG.js filter API. Prefer it for that case.

## SVG filter cheat-sheet (distortion family)

| Primitive | Purpose | Key attrs |
|---|---|---|
| `feTurbulence` | Procedural noise source | `type=fractalNoise\|turbulence`, `baseFrequency`, `numOctaves`, `seed` |
| `feDisplacementMap` | Warp `in` by a noise map | `in`, `in2`, `scale`, `xChannelSelector`, `yChannelSelector` |
| `feGaussianBlur` | Soft blur / glow base | `stdDeviation` |
| `feColorMatrix` | Recolor, alpha tricks (gooey) | `type=matrix\|saturate` |
| `feComposite` / `feMerge` | Combine results | `operator`, `in/in2` |

**Animate these from JS for life:**
- `baseFrequency` (e.g. `0.012 0.018`) → lower = larger, lazier waves; higher = tight chop.
- `scale` on `feDisplacementMap` → displacement strength (0 = no warp). Drive from input velocity.
- Give the filter generous region: `x="-20%" y="-20%" width="140%" height="140%"` so warped edges aren't clipped.

### Water ripple — parameter tuning
- `velocity = velocity*0.6 + speed*0.4` → exponential smoothing of pointer speed; raise the second term for snappier response.
- `targetScale = min(velocity*1.2, 90)` → cap so fast flicks don't tear the layout.
- `currentScale += (desired - currentScale)*0.18` → critically important easing; lower factor = more lag/inertia.
- Idle `baseScale = 4 + sin(t*0.0006)*1.5` → keeps a gentle "underwater" wobble at rest.
- Drift the noise over time for flow: animate `baseFrequency` with `sin/cos(t)`.

## Canvas particle system patterns

### Particle struct
```js
{ x, y, vx, vy, size, color, phase /* 'fall' | 'gather' | 'formed' */, tx, ty, gatherDelay, flash }
```

### Phases
- `fall`: `vy += gravity; x += vx; y += vy;` bounce off floor with `vy *= -restitution`.
- `gather`: seek a target — accelerate toward `(tx,ty)`, damp velocity, snap when `dist < 4`.
- `formed`: settled; decay a `flash` value for a landing sparkle.

```js
// bullet-like seek (gather phase)
const dx = p.tx-p.x, dy = p.ty-p.y, dist = Math.hypot(dx,dy);
if (dist < 4){ p.x=p.tx; p.y=p.ty; p.phase='formed'; p.flash=1; addImpactRing(p); }
else { const f=0.55; p.vx+=dx/dist*f; p.vy+=dy/dist*f; p.vx*=0.88; p.vy*=0.88; p.x+=p.vx; p.y+=p.vy; }
```

### Text → particle targets
Render the word to an offscreen canvas, read alpha, keep opaque cells on a grid:
```js
const off = document.createElement('canvas'); off.width=W; off.height=H;
const octx = off.getContext('2d');
octx.fillStyle='#fff'; octx.textAlign='center'; octx.textBaseline='middle';
octx.font = `700 ${Math.min(320, W*0.18, H*0.5)}px "Space Grotesk"`;
octx.fillText('DSCode', W/2, H/2);
const data = octx.getImageData(0,0,W,H).data, targets=[];
for (let y=0;y<H;y+=6) for (let x=0;x<W;x+=6)
  if (data[(y*W+x)*4+3] > 128) targets.push({x,y});
// shuffle, then assign targets[i % targets.length] to each particle (+ small jitter)
```
- `step` (6) controls density vs cost. Keep total targets ≈ 1500–3000.
- If particles < targets, spawn fillers from the bottom edge so the word completes.
- Add per-particle `gatherDelay` so they converge in waves, not all at once.

### UI elements as colliders
Make each UI piece both drawable and a physics body. Three primitive types cover most UIs:
- `text` — AABB from `ctx.measureText().width` × fontSize.
- `card` — rectangle; explode along perimeter + scatter interior.
- `line` — explode along the segment.

AABB hit test (letter vs collider) with a small margin, then resolve by comparing letter center to collider center to choose top/bottom bounce. On hit: `collider.active=false; explodeCollider(collider);`.

### Impact feel
- `flashAlpha` full-screen white, decays `*0.82` per frame.
- `shake`: `ctx.translate(rand*shake, rand*shake)` inside `save/restore`, decays `*0.88`.
- `impactRings`: expanding stroked circles, `life -= 0.045`.
- Trails: clear with `ctx.fillStyle='rgba(8,9,15,0.22)'; ctx.fillRect(...)` instead of `clearRect`.

## Common pitfalls

- **Forgetting DPR** → blurry canvas. Always scale backing store and `setTransform`.
- **Measuring/rasterizing text before fonts load** → wrong metrics. Gate on `document.fonts.ready`.
- **No `dt` clamp** → physics blow up after tab is backgrounded. `dt = Math.min(33, t-last)`.
- **Unbounded spawners** → frame drops. Cap arrays (particles, ripples, letters).
- **Setting displacement `scale` directly from velocity** → jarring. Always ease toward a target.
- **Pointer events on distorted UI** feel off — keep hover/click targets out of the heavy filter or compensate.
- **`mix-blend-mode` / `filter` on huge subtrees** is expensive; scope filters to the smallest necessary container.

## Reusable scaffolding (per-frame loop)

```js
let last = performance.now();
function frame(t){
  const dt = Math.min(33, t - last); last = t;
  update(dt);   // physics / state machine
  render(dt);   // draw
  requestAnimationFrame(frame);
}
document.fonts.ready.then(() => { resize(); requestAnimationFrame(frame); });
addEventListener('resize', resize);
```
