## 1. Implementation

- [x] 1.1 In `TransitionCanvas.tsx` `strikeRow()`, after the unstruck-row recalibration for-loop and before the `hopping` state update, add `s.rows.sort((a, b) => a.top - b.top)` and `c.rowIndex = s.rows.findIndex(r => r === row)`

## 2. Validation

- [x] 2.1 Build frontend (`npm run build:web`) — confirm no type errors
- [x] 2.2 Manual test: trigger Chat → Dashboard transition with a markdown table message — verify cluster cascades top-to-bottom without jumping upward
- [x] 2.3 Manual test: trigger Chat → Dashboard transition with a multi-line tool result — verify cluster cascades correctly and web UI does not shift up
