## 1. Backend Fix

- [x] 1.1 In `src/ui/web/web-backend.ts`, add `this.broadcastContextWindow(true)` after the `ready` event is sent in the session `load` handler (after line ~1038)

## 2. Verification

- [x] 2.1 Run `npm run build:web && npm start -- --web` and verify that loading a saved session updates the context window bar with the correct token breakdown
- [x] 2.2 Verify the bar still updates correctly during normal chat (tool calls, turn end) — no regression
