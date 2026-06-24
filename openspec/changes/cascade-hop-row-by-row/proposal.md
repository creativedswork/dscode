## Why

The cascade animation uses 4 independent letters (D, S, C, O) that each lock onto the first unstruck row at spawn, strike it, bounce, and then fall through all subsequent rows without hitting them — because the letter's X position (locked to row 0's center) doesn't overlap remaining rows' narrower bounding rects. With only 4 letters and 10+ content rows in a typical chat, each letter hits 1 row, leaving 60%+ of content untouched. Worse, the gather transition requires `allRowsStruck === true`, which never becomes true — the animation deadlocks forever with no fallback escape path.

The fix is not to add more letters or tune bounce parameters. The independent-letter-per-target architecture is the wrong model for sequential row-by-row destruction. A unified hop-step cluster that visits every row in DOM order, like a 跳一跳 game piece, naturally guarantees 100% coverage with clean, readable timing.

## What Changes

- **Replace independent-letter model with unified hop-step cluster**: Delete `CascadeLetter[]`, per-letter spawning (`trySpawnLetter`), per-letter physics, and the collision scan loop. Replace with a single "dscode" cluster entity that hops row-by-row via pre-computed parabolic arcs — squash-stretch deformation on impact, 300ms dwell after each strike with subtle breathing animation, then launch to the next row. No rotation, no gravity accumulation, no horizontal drift.

- **Content-only strike filtering** (merged from `cascade-content-only-strike`): `buildRowList()` excludes parent-level `[data-collider]` containers via `closest()` nesting check. Empty colliders of all types are filtered. Content-tight width via `measureText` for text-line/code-line/tool-result-line. Scroll-clipped elements are excluded. Each row gets a pre-computed random landing X with no-two-consecutive-rows-same-X constraint.

- **Fix transition deadlock**: Replace the broken `allRowsStruck` gate with a phase-completion condition based on row index. When the cluster finishes the last row (or all rows are struck), immediately start gather. Add safety timeout fallback (8s) that forces gather even if some rows are unreachable.

- **Remove dead code**: Delete `LETTER_POOL`, `MAX_LETTERS`, `RESPAWN_COOLDOWN_MS`, `shouldLetterExit`, drift logic, stuck-timer, per-letter target assignment, and the `struckElements` Set.

- **Unchanged**: `destroyByType` family (8 handlers), particle/ring/shard systems, gather/formed phases, ESC-to-skip, debug HUD, color map, DPR cap, reduced-motion check.

## Capabilities

### Modified Capabilities

- `dashboard-cascade-transition`: The cascade phase model changes from "4 independent letters falling under gravity with column-based targeting" to "unified hop-step cluster hopping row-by-row with parabolic arcs, squash-stretch deformation, and dwell timing." Row list extraction gains nesting exclusion, empty filtering, content-tight width measurement, and scroll-clip visibility checks. Transition-to-gather condition changes from `allRowsStruck` to row-index-based completion.

## Impact

- **Affected code**: `web/src/components/TransitionCanvas.tsx` — major rewrite of cascade phase (~200 lines removed, ~250 added): `buildRowList()` rewritten, `trySpawnLetter` replaced by cluster hop-state machine, `updateCascade()` replaced by hop-step update, `drawLetters()` rewritten for cluster rendering with squash-stretch. `AnimationState` interface gains cluster fields, loses letter fields.
- **Affected specs**: `openspec/changes/dashboard-cascade-transition/specs/` — "Four-letter cascade model" and "Live DOM collision and opacity transition" sections rewritten; "Letter physics" replaced with "Hop-step cluster physics."
- **No API changes**: All client-side animation logic only. `TransitionCanvas` props unchanged.
- **No new dependencies**.
- **Supersedes**: `cascade-impact-redesign`, `cascade-content-only-strike`, `cascade-hop-step`, `cascade-hop-dwell`, `cascade-visible-refinement`, `cascade-strike-critical-fixes`, `cascade-layer-strike`, `cascade-letter-visibility`, `independent-letter-cascade`.
