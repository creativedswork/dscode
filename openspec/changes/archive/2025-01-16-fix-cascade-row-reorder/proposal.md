## Why

Cascade phase row positions drift after DOM mutation (innerHTML replacement, inline→inline-block conversion), but `rows[]` is never re-sorted after recalibration. This causes the cluster to hop to rows above the current visual position — most visibly when striking markdown table cells or multi-line tool result spans.

## What Changes

- After `strikeRow()` recalibrates unstruck row positions, re-sort `rows[]` by `top` and update `c.rowIndex` to match the current struck row's new array position.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `chat-dashboard-transition`: Cascade row ordering SHALL be maintained after recalibration so that `launchHop` always targets the visually next unstruck row.

## Impact

- `web/src/components/TransitionCanvas.tsx` — `strikeRow()` recalibration block (~L809-838)
