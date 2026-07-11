# Design: Cascade Element Interaction Hierarchy

## Overview

During the Chat → Dashboard cascade animation, the dscode cluster currently interacts only with `[data-collider]` elements. This design adds two new interaction modes — passive dissolution (timestamps) and explicit preservation (thinking blocks) — creating a three-tier hierarchy without disrupting the existing strike pipeline.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 updateCascade(dt)                    │
│                                                     │
│  switch (c.hopState) {                              │
│    case "hopping":  ...  // existing arc logic       │
│    case "dwell":     ...  // existing breath logic   │
│    case "squash":    ...  // existing deform logic   │
│    case "stretch":   ...  // existing rebound logic  │
│    case "drop":      ...  // existing descent logic  │
│  }                                                  │
│                                                     │
│  checkTimestampProximity();  ← NEW: after hop/dwell │
│  // particle/shards update (existing)                │
│}                                                    │
└─────────────────────────────────────────────────────┘
```

The proximity check runs every frame during `hopping` and `dwell` states only — these are the states where the cluster moves through space between or at rows, where timestamps might be intersected.

## Data Structures

### Timestamp Entry (in AnimationState)

```ts
interface TimestampEntry {
  el: HTMLElement;       // the .meta div
  top: number;           // canvas-relative Y of element top
  bottom: number;        // canvas-relative Y of element bottom
  dissolved: boolean;    // one-shot guard
}
```

Added to `AnimationState`:
```ts
timestamps: TimestampEntry[];         // collected at init
dissolvedTimestampEls: Set<HTMLElement>; // fast one-shot lookup
```

### Proximity Constants

```ts
const TIMESTAMP_PROXIMITY_PX = 60;  // vertical distance threshold
```

## Collection: buildTimestampList()

Called once during initialization, immediately after `buildRowList()`:

```ts
function buildTimestampList(): TimestampEntry[] {
  const canvasRect = canvas!.getBoundingClientRect();
  const entries: TimestampEntry[] = [];

  container.querySelectorAll<HTMLElement>(".meta").forEach((el) => {
    const rect = el.getBoundingClientRect();
    const top = rect.top - canvasRect.top;
    const bottom = top + rect.height;

    // Visibility filter — same as row builder
    if (top >= H || bottom <= 0) return;

    // Scroll-clip filter
    const scrollAncestor = findScrollAncestor(el);
    if (scrollAncestor) {
      const saRect = scrollAncestor.getBoundingClientRect();
      if (rect.bottom <= saRect.top || rect.top >= saRect.bottom) return;
    }

    entries.push({ el, top, bottom, dissolved: false });
  });

  return entries;
}
```

**Design decision**: Query `.meta` directly rather than adding `data-collider`. Adding a collider attribute would pull timestamps into `buildRowList()` and require special-case handling in the strike/destruction pipeline. Keeping them separate is simpler and correctly reflects that they are NOT colliders.

## Proximity Detection: checkTimestampProximity()

```ts
function checkTimestampProximity(): void {
  const c = s.cluster;
  // Only check during movement or pause states
  if (c.hopState !== "hopping" && c.hopState !== "dwell") return;

  const clusterY = c.y;
  const threshold = TIMESTAMP_PROXIMITY_PX;

  for (const ts of s.timestamps) {
    if (ts.dissolved) continue;

    const tsCenter = (ts.top + ts.bottom) / 2;
    const distance = Math.abs(clusterY - tsCenter);

    if (distance < threshold) {
      ts.dissolved = true;
      s.dissolvedTimestampEls.add(ts.el);
      dissolveTimestamp(ts.el);
    }
  }
}
```

### Why check during "dwell" too?

When the cluster dwells at a row after striking, a timestamp might be adjacent to that row. Without the dwell check, the timestamp would sit there untouched while the cluster breathes right next to it — visually incomplete.

### Why NOT check during "drop"?

The initial drop is fast and the cluster descends from above the viewport. Timestamps are typically positioned at the top of each message, near where the cluster begins. The drop would trigger premature dissolution before the cluster has struck anything, breaking the top-to-bottom cascade feel.

## Dissolution Effect: dissolveTimestamp()

```ts
function dissolveTimestamp(el: HTMLElement): void {
  const text = el.textContent || "";
  const canvasRect = canvas!.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const rx = rect.left - canvasRect.left;
  const ry = rect.top - canvasRect.top;

  // Determine the split point: everything before "·" is the name portion
  const dotIndex = text.indexOf("·");
  const namePart = dotIndex >= 0 ? text.slice(0, dotIndex) : text;
  const restPart = dotIndex >= 0 ? text.slice(dotIndex) : "";

  // Approximate character positions across the element width
  const charWidth = rect.width / Math.max(text.length, 1);
  const chars = [...text];

  for (let i = 0; i < chars.length; i++) {
    const isNameChar = dotIndex >= 0 ? i < dotIndex : i < namePart.length;
    const charColor = isNameChar ? colors.accent : colors.textMuted;

    const cx = rx + i * charWidth + charWidth / 2;
    const cy = ry + rect.height / 2;

    // 2-3 particles per character
    const particleCount = randInt(2, 3);
    for (let j = 0; j < particleCount; j++) {
      s.particles.push({
        x: cx + rand(-4, 4),
        y: cy + rand(-4, 4),
        vx: rand(-2, 2),
        vy: rand(-4, -1),  // upward drift
        size: rand(1, 3),
        color: charColor,
        phase: "fall",
        life: randInt(400, 600),
      });
    }
  }

  // Fade the original DOM element
  el.style.transition = "opacity 300ms ease-out";
  el.style.opacity = "0";
}
```

**Design decision — canvas particles, not DOM animation**: Unlike text-line destruction which uses DOM clone+overlay with CSS keyframes, timestamp dissolution uses canvas particles. Reason: there's no collision/strike to anchor the effect to. The DOM clone approach requires precise timing relative to a strike event. Canvas particles are fire-and-forget — they spawn at the right position and the existing particle physics system handles the rest.

**Color split logic**: The "·" character serves as a natural delimiter between the agent name and the time. Characters before "·" get `--color-accent`; "·" and characters after get `--color-text-muted`. If no "·" is found (unlikely but defensive), the entire text gets accent color.

## Thinking Blocks: No Design Needed

Thinking blocks already have no `data-collider` attribute and are excluded from `buildRowList()`. The cascade animation completely ignores them. The cluster may visually pass over them (canvas at z-index 50 renders above the DOM), but there is no interaction. This is the intended behavior — formalized by the spec, requiring zero code changes.

## Integration Points

| Change | File | Scope |
|--------|------|-------|
| Add `TimestampEntry` interface | `animation/types.ts` | ~8 lines |
| Add `timestamps` + `dissolvedTimestampEls` to `AnimationState` | `TransitionCanvas.tsx` | ~4 lines |
| Add `buildTimestampList()` | `TransitionCanvas.tsx` | ~25 lines |
| Call `buildTimestampList()` after `buildRowList()` | `TransitionCanvas.tsx` | ~2 lines |
| Add `dissolveTimestamp()` | `TransitionCanvas.tsx` | ~40 lines |
| Add `checkTimestampProximity()` | `TransitionCanvas.tsx` | ~20 lines |
| Call `checkTimestampProximity()` in `updateCascade()` | `TransitionCanvas.tsx` | ~2 lines |
| Clean up timestamp opacity on teardown (optional) | `TransitionCanvas.tsx` | ~5 lines |

All changes are contained in `TransitionCanvas.tsx` (and `types.ts` for the interface). No changes to ChatView, Markdown, ToolCard, or any other component.

## Edge Cases

### Multiple timestamps at same Y
Two messages can have timestamps at similar vertical positions (e.g., a quick back-and-forth). The proximity check iterates all undissolved timestamps each frame, so both will dissolve in the same frame if within threshold. This is fine — a brief burst of timestamp particles creates a nice effect.

### Timestamp inside a struck message-card
When `message-card` is destroyed via `destroyMessageCard()`, its children (text-lines, tool-cards) are individually struck. The timestamp `.meta` is a sibling of the message-card, not a child. In the DOM:

```html
<div class="assistant-msg">
  <div class="meta">dscode · 09:41</div>    ← sibling, NOT child of message-card
  <div class="thinking">...</div>
  <div data-collider="message-card">         ← message-card
    <span data-collider="text-line">...</span>
  </div>
</div>
```

So `cleanupParents()` walking up from a struck text-line would reach `message-card` but never reach `.meta`. No conflict.

### Timestamp after message-card cleanup
If a message-card's children are all struck, `cleanupParents()` fades the message-card to opacity 0 and spawns particles. The sibling `.meta` is unaffected — it will dissolve later when the cluster passes nearby. This creates a layered destruction: children first, then card, then metadata floating above.

### User message timestamp "You · 09:41"
The `.user-msg .meta` div uses the same class. `buildTimestampList()` queries all `.meta` elements, so user timestamps are collected too. The color split logic works the same way — "You" characters get accent, "· 09:41" gets muted. Consistent behavior.

### No timestamps in conversation
If `buildTimestampList()` returns an empty array, `checkTimestampProximity()` is a no-op (loop over empty array). Zero overhead.

### Thinking block that was collapsed
The `.thinking.collapsed` state uses `max-height: 0` and `opacity: 0` on the body, but the label remains visible. The element is still in the DOM and still has no `data-collider`. No special handling needed — it's already invisible to the cascade.

## Performance

`checkTimestampProximity()` runs every rAF frame during hop/dwell. Typical conversation has 5-20 messages, so 5-20 `.meta` elements. The check is:
- One `hopState` comparison (early exit for non-hop/dwell)
- Loop over ≤20 entries
- Per entry: one cached `tsCenter` check (already computed from init-time rects)

This is negligible compared to the existing per-frame work (particle physics for up to 2500 particles, canvas draw calls, DOM mutation).

**Decision against re-querying `.meta` each frame**: The scroll is locked during animation, so timestamp positions are static. Caching rects at init is safe and avoids `getBoundingClientRect()` per frame.
