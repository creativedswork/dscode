## 1. Event Layer

- [x] 1.1 Expand `turn:end` usage type in `src/core/events.ts`: change from `{ inputTokens: number; outputTokens: number }` to `{ input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } }`
- [x] 1.2 Update `src/core/harness.ts` to map full `AssistantMessage.usage` to the new usage payload structure in the `turn:end` emit call

## 2. TUI Rendering

- [x] 2.1 Add `formatTokens()` and `formatCost()` helper functions in `src/ui/tui-app.ts` (module-level, private)
- [x] 2.2 Update `finishAssistantMessage()` signature in `src/ui/tui-app.ts` to accept `usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } }`
- [x] 2.3 Implement the merged-line rendering logic: combine `⏱ total wait` (if present) with `📊 tokens↓↑`, `▓▓ context%`, and `💰 cost` into a single dim `addInfo` call
- [x] 2.4 Update `src/ui/tui-backend.ts` to pass `e.usage` from the `turn:end` event handler to `this.tui.finishAssistantMessage(e.usage)`

## 3. Context Percentage

- [x] 3.1 Add `formatContextPercent(estimated: number, contextWindow: number)` helper function in `src/ui/tui-app.ts`: compute `Math.round(estimated / contextWindow * 100)`, return dim/yellow/red colored `▓▓ XX%` string based on threshold (≤80% dim, >80% yellow, >95% red)
- [x] 3.2 Update `finishAssistantMessage()` to fetch `estimatedTokens` from `this.deps.contextManager.getEstimatedTokens(this.deps.agent.state.messages)` and `contextWindow` from `this.deps.contextManager.getContextWindow()`, append `▓▓ XX%` segment to `parts[]`
- [x] 3.3 Handle edge case: when `contextWindow` is 0 or `estimatedTokens` is NaN, silently omit the `▓▓` segment

## 4. Verify

- [x] 4.1 Run `npm run typecheck` to ensure all type changes compile
- [x] 4.2 Run `npm test` to verify no regressions
- [x] 4.3 Run `npm run typecheck` after context percentage changes
- [x] 4.4 Run `npm test` after context percentage changes
- [x] 4.5 Manual smoke test: start TUI (`npm start`), send a message, verify token/cost line appears after assistant response
- [ ] 4.6 Manual smoke test: verify `▓▓ XX%` appears with correct color at various utilization levels
