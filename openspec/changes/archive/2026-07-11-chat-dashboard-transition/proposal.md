## Why

The cascade transition currently destroys all `[data-collider]` elements identically — every DOM node with a collider attribute gets struck, squashed, and scattered. Two element types previously sat outside this system: thinking blocks (which were intentionally preserved) and timestamps (which lingered untouched). This change adds thinking blocks to the active strike tier and gives timestamps a graceful proximity-based dissolution, creating a deliberate three-tier interaction hierarchy.

## What Changes

- **Thinking blocks added to active strike tier**: The `.thinking` block receives `data-collider="thinking-block"`, making it a cascade target. When struck, it dissolves quietly — opacity fade + gentle particle emission from the text region, without the violent character scatter of text-line destruction.
- **Timestamp dissolution on proximity**: When the dscode cluster's Y position comes within 60px of a `.meta` timestamp element, the timestamp dissolves into colored particles (accent for name portion, muted for time) without any collision physics — no squash/stretch, no impact rings, no trajectory change.
- **Three-tier hierarchy formalized**: Active Strike (data-collider elements get full physics + type-specific destruction), Passive Dissolution (timestamps dissolve on proximity), Preserved (none — thinking blocks moved to Active Strike).

No breaking changes. The existing cascade pipeline (buildRowList → hop-step → strike → gather → formed) is unchanged. The new behavior is additive — new proximity check runs alongside the existing hop logic.

## Capabilities

### Modified Capabilities
- `chat-dashboard-transition`: Four requirements — thinking block active strike, timestamp dissolution on cluster proximity, three-tier element interaction hierarchy, and a new `destroyThinkingBlock()` destruction effect.

## Impact

- `web/src/components/TransitionCanvas.tsx` — ~120 lines added: `buildTimestampList()`, `checkTimestampProximity()`, `dissolveTimestamp()`, `destroyThinkingBlock()`, new state fields
- `web/src/animation/types.ts` — `TimestampEntry` interface (~8 lines)
- `web/src/components/ChatView.tsx` — ThinkingBlock component: add `data-collider="thinking-block"` attribute
- No API changes, no backend impact
