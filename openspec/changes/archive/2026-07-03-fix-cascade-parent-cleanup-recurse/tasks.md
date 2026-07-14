## Tasks

### Implementation

- [x] Extract `strikeRow()` parent cleanup into a `cleanupParents(el: HTMLElement)` function that walks up the DOM tree
- [x] `cleanupParents`: collect all ancestor containers with `data-collider="tool-card"` or `data-collider="message-card"`
- [x] `cleanupParents`: for each ancestor (innermost first), check if all `[data-collider]` descendants are struck or hidden
- [x] `cleanupParents`: if all done, spawn particles + transition opacity to 0; if not, stop walking
- [x] Call `cleanupParents(row.el)` from `strikeRow()` after `destroyByType()`, replacing the current single-level `closest()` cleanup (lines 845–860)
- [x] Build and verify typecheck passes
