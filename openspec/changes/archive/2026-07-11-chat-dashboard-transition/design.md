## Context

The Chat → Dashboard transition uses a `TransitionCanvas` component that renders a transparent canvas overlay. During the cascade phase, a six-letter "dscode" cluster hop-steps through `[data-collider]` DOM elements, striking each with type-specific destruction effects (character scatter, code corruption, clip-path wipes).

Currently, two element types sit outside the collider system:
- **`.meta` timestamps** ("dscode · 09:41", "You · 09:41") — no `data-collider`, invisible to the row builder
- **`.thinking` blocks** — no `data-collider`, also invisible

Both are left untouched during the cascade. This change addresses both: timestamps dissolve on proximity, and thinking blocks (previously preserved) are now added to the active strike tier.

## Goals / Non-Goals

**Goals:**
- Thinking blocks receive `data-collider="thinking-block"` and are struck with a quiet dissolution effect (gentle particle rise, no character scatter, no impact rings)
- Timestamps dissolve into particles when the cluster passes within 60px vertical proximity, without collision physics
- No new `data-collider` attributes for timestamps — they stay out of the row list
- Changes to ChatView (ThinkingBlock component only) and TransitionCanvas

**Non-Goals:**
- Thinking blocks do NOT get character-scatter or violent destruction — the effect is deliberately subtle
- No particle effects for thinking blocks — they were previously preserved; now they dissolve quietly
- No changes to the gather/formed phases — this is cascade-phase only
- No timestamp dissolution during the initial "drop" state (would dissolve timestamps before any content is struck)

## Decisions

### 1. Proximity-based dissolution, not collider-based

**Chosen**: Timestamps are collected via `.meta` querySelectorAll at init, cached as `TimestampEntry[]`, and checked per-frame for proximity during hop/dwell states.

**Alternative considered**: Add `data-collider="timestamp"` and include them in the row list with a special destruction type. Rejected because:
- Would require special-case handling in the hop-step state machine (skip squash/stretch, skip `strikeRow()`)
- Timestamps would become "stops" on the cluster's journey, altering the cascade rhythm
- Proximity-based feels more natural — metadata evaporates as the cluster sweeps past, not as a discrete "strike" event

### 2. Canvas particles, not DOM clone+overlay

**Chosen**: Timestamp dissolution spawns canvas particles directly into the existing particle system.

**Alternative considered**: DOM clone+overlay with CSS keyframes (like text-line destruction). Rejected because:
- Clone+overlay requires precise timing relative to a strike event
- Timestamps have no strike event — dissolution is proximity-triggered
- Canvas particles are fire-and-forget and integrate with the existing physics system

### 3. Color split at "·" character

**Chosen**: Characters before "·" get `--color-accent`, "·" and after get `--color-text-muted`.

**Rationale**: The "·" is a natural visual delimiter between agent name and time. This creates a two-tone particle effect that mirrors the timestamp's typographic hierarchy.

### 4. Check during hop AND dwell

**Chosen**: Proximity check runs during both `hopping` and `dwell` states.

**Rationale**: When the cluster dwells at a row after striking, adjacent timestamps should dissolve too. Without the dwell check, a timestamp sitting right next to the cluster's dwell position would remain visible — visually incomplete.

### 5. No drop-state checking

**Chosen**: Skip proximity check during `drop` state.


### 6. Thinking block: quiet dissolution, not character scatter

**Chosen**: `destroyThinkingBlock()` fades the entire `.thinking` div to `opacity: 0` over 300ms and spawns 15–25 gentle particles (size 1–2px, vy rand(-3, -1), life rand(600, 1000)ms) from the text region. No clone overlay, no character scatter, no impact rings, no shards.

**Rationale**: Thinking content is internal monologue — it should evaporate quietly, not explode. The effect mirrors the timestamp dissolution aesthetic (low-energy particle emission) but uses the strike pipeline (squash → stretch → dwell → hop) so the cluster rhythm isn't disrupted. Different from `text-line` which uses aggressive per-character scatter.

**Alternative considered**: Reuse `destroyTextLine` directly. Rejected because per-character scatter is too violent for internal thought — the visual language should distinguish between displayed output (scatter) and internal reasoning (gentle fade).

## Risks / Trade-offs

- **[Risk] Timestamps dissolve too early**: If the proximity threshold (60px) is too large, timestamps dissolve before the cluster visually reaches them. → **Mitigation**: 60px is ~3-4 lines of text — tight enough to feel reactive. Can be tuned.
- **[Risk] Timestamps dissolve too late**: If the cluster hops past a timestamp quickly (short gap between rows), the proximity window might be missed. → **Mitigation**: The check runs every rAF frame (~16ms), and the hop duration is 350-800ms. Plenty of frames to catch proximity.
- **[Risk] User timestamps look different**: "You · 09:41" has a shorter name portion (3 chars vs 6), so fewer accent-colored particles. → **Trade-off**: This is acceptable — the visual imbalance reflects the actual text. The total particle count is proportional to character count regardless.
