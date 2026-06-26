## Context

`strikeRow()` mutates struck DOM elements (innerHTML replacement, display changes) then recalibrates all unstruck row positions via live `getBoundingClientRect()`. However, `rows[]` is initialized once in `buildRowList()` with a `sort((a,b) => a.top - b.top)` and never re-sorted. When DOM layout shifts cause unstruck rows to move relative to struck rows, the array order becomes stale — `launchHop()` uses `c.rowIndex + 1` assuming the next array entry is the next visual row, which may not hold.

## Goals / Non-Goals

**Goals:**
- Ensure `rows[]` ordering reflects live visual Y positions after every `strikeRow()` recalibration
- `launchHop()` must target the visually correct next unstruck row

**Non-Goals:**
- Changing the destruction effects or layout-freeze strategy
- Altering hop-step physics
- Re-sorting during `hopping` mid-flight (already handled by `c.hopEndY` update)

## Decisions

**Re-sort in `strikeRow()` after recalibration, then update `c.rowIndex`**

After the for-loop that re-measures unstruck rows, add:

```js
s.rows.sort((a, b) => a.top - b.top);
c.rowIndex = s.rows.findIndex(r => r === row);
```

The `row` variable is a captured reference to the struck `CascadeRow` object — `findIndex` by identity is safe.

Alternatives considered:
- **Re-sort only unstruck slice, place struck at index 0**: Would require re-indexing all struck rows, adds complexity. Full re-sort is simpler and struck rows cluster near their original Y anyway (preFreezeTop is used).
- **Guard in `launchHop` to skip rows with `top < currentRow.top`**: Partial fix — handles upward drift but doesn't fix downward drift or order inversion among unstruck rows. Re-sort is the root fix.

## Risks / Trade-offs

- [Rows with equal `top` may swap] → `sort()` is stable in modern JS; ties preserve original order.
- [Struck rows may interleave with unstruck after sort] → Expected and correct — the cluster always proceeds to the next-lowest unstruck row.
